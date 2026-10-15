"""Send in-app feedback to the Lobelia support inbox through the existing Resend setup."""

from __future__ import annotations

import asyncio
import html
import os
import time
from collections import defaultdict, deque

import resend

from services.auth_email import DEFAULT_FROM_EMAIL, SUPPORT_EMAIL

FEEDBACK_TO_EMAIL = os.getenv("FEEDBACK_TO_EMAIL", SUPPORT_EMAIL)
RATE_LIMIT = 5
RATE_WINDOW_SECONDS = 3600

# key (user id or client IP) -> send times; in memory, so per server instance
_recent: dict[str, deque] = defaultdict(deque)


class FeedbackRateLimited(Exception):
    pass


def check_rate_limit(key: str, now: float | None = None) -> None:
    now = time.time() if now is None else now
    sent = _recent[key]
    while sent and now - sent[0] > RATE_WINDOW_SECONDS:
        sent.popleft()
    if len(sent) >= RATE_LIMIT:
        raise FeedbackRateLimited()
    sent.append(now)


def build_email(
    *,
    message: str,
    category: str,
    user_email: str | None,
    user_id: str | None,
    allow_reply: bool,
    page: str | None,
    app_version: str | None,
    user_agent: str | None,
) -> dict:
    """Resend payload. Everything the user typed is HTML-escaped."""
    rows = [
        ("Category", category),
        ("From", user_email or "Not signed in"),
        ("User id", user_id or "—"),
        ("OK to reply", "Yes" if allow_reply and user_email else "No"),
        ("Page", page or "—"),
        ("App version", app_version or "—"),
        ("Browser", user_agent or "—"),
    ]
    details = "".join(
        f"<tr><td style='padding:2px 12px 2px 0;color:#555'>{html.escape(label)}</td>"
        f"<td>{html.escape(str(value))}</td></tr>"
        for label, value in rows
    )
    body = html.escape(message).replace("\n", "<br>")

    payload = {
        "from": DEFAULT_FROM_EMAIL,
        "to": FEEDBACK_TO_EMAIL,
        "subject": f"Lobelia feedback: {category}",
        "html": f"<div style='font-family:Arial,sans-serif'><p>{body}</p><hr><table>{details}</table></div>",
    }
    # reply goes to the user only when they agreed; otherwise it stays with support
    payload["reply_to"] = user_email if allow_reply and user_email else SUPPORT_EMAIL
    return payload


async def send_feedback(payload: dict) -> None:
    if not resend.api_key:
        raise RuntimeError("RESEND_API_KEY must be set")
    # the Resend SDK is synchronous; keep it off the event loop
    await asyncio.to_thread(resend.Emails.send, payload)
