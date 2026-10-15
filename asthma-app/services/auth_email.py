"""Email helpers for auth verification codes."""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

import resend

resend.api_key = os.getenv("RESEND_API_KEY")

AUTH_CODE_TTL_SECONDS = int(os.getenv("AUTH_CODE_TTL_SECONDS", "600"))
# lobelia.app is a verified Resend domain; the env var still overrides this
DEFAULT_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "Lobelia <noreply@lobelia.app>")
# replies to user-facing emails (codes) go to the support inbox, not the no-reply sender
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "support@lobelia.app")
AuthCodePurpose = Literal["signup", "reset"]

_pending_codes: dict[tuple[str, AuthCodePurpose], tuple[str, datetime]] = {}


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _make_code() -> str:
    return f"{secrets.randbelow(900000) + 100000}"


def _store_code(email: str, purpose: AuthCodePurpose, code: str) -> None:
    _pending_codes[(_normalize_email(email), purpose)] = (
        code,
        datetime.now(timezone.utc) + timedelta(seconds=AUTH_CODE_TTL_SECONDS),
    )


def verify_code(email: str, purpose: AuthCodePurpose, code: str, consume: bool = True) -> bool:
    key = (_normalize_email(email), purpose)
    pending = _pending_codes.get(key)
    if not pending:
        return False

    stored_code, expires_at = pending
    if expires_at < datetime.now(timezone.utc):
        _pending_codes.pop(key, None)
        return False

    matches = secrets.compare_digest(stored_code, code.strip())
    if matches and consume:
        _pending_codes.pop(key, None)

    return matches


async def _send_code_email(email: str, code: str, *, subject: str, heading: str) -> dict:
    if not resend.api_key:
        raise RuntimeError("RESEND_API_KEY must be set")

    try:
        response = resend.Emails.send(
            {
                "from": DEFAULT_FROM_EMAIL,
                "to": email,
                "reply_to": SUPPORT_EMAIL,
                "subject": subject,
                "html": f"""
                    <div style=\"font-family: Arial, sans-serif; padding: 20px;\">
                        <h2>{heading}</h2>
                        <p style=\"font-size: 24px; font-weight: bold; letter-spacing: 0.12em;\">{code}</p>
                        <p>This code expires in 10 minutes.</p>
                    </div>
                """,
            }
        )
        return response
    except Exception as exc:
        raise RuntimeError(f"Failed to send email: {exc}") from exc


async def issue_code(email: str, purpose: AuthCodePurpose) -> str:
    code = _make_code()
    _store_code(email, purpose, code)

    if purpose == "signup":
        await _send_code_email(
            email,
            code,
            subject="Your Lobelia signup code",
            heading="Your signup code",
        )
    else:
        await _send_code_email(
            email,
            code,
            subject="Your Lobelia reset code",
            heading="Your reset code",
        )

    return code