"""Google Calendar OAuth, event fetch, and edits to existing events (free Calendar API quota)."""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote, urlencode
from zoneinfo import ZoneInfo

import httpx
from jose import JWTError, jwt

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
# Narrowest scope that covers the feature: read and edit events on calendars the user
# owns (we only use the primary calendar). Required for Google OAuth verification.
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned"


def oauth_configured() -> bool:
    return bool(os.getenv("GOOGLE_OAUTH_CLIENT_ID") and os.getenv("GOOGLE_OAUTH_CLIENT_SECRET"))


def redirect_uri() -> str:
    return os.getenv(
        "GOOGLE_OAUTH_REDIRECT_URI",
        "http://127.0.0.1:8000/v1/calendar/callback",
    )


def frontend_redirect_url() -> str:
    # Default to an API-hosted page so OAuth works without Vite running on :5173.
    return os.getenv(
        "GOOGLE_OAUTH_FRONTEND_REDIRECT",
        "http://127.0.0.1:8000/v1/calendar/oauth-done",
    )


def _jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is required for calendar OAuth state")
    return secret


def create_oauth_state(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    return jwt.encode(
        {"sub": user_id, "purpose": "google_calendar_oauth", "exp": expire},
        _jwt_secret(),
        algorithm="HS256",
    )


def decode_oauth_state(state: str) -> str | None:
    try:
        payload = jwt.decode(state, _jwt_secret(), algorithms=["HS256"])
    except JWTError:
        return None
    if payload.get("purpose") != "google_calendar_oauth" or "sub" not in payload:
        return None
    return str(payload["sub"])


def build_auth_url(user_id: str) -> str:
    if not oauth_configured():
        raise RuntimeError(
            "Google Calendar OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and "
            "GOOGLE_OAUTH_CLIENT_SECRET."
        )
    params = {
        "client_id": os.environ["GOOGLE_OAUTH_CLIENT_ID"],
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": CALENDAR_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": create_oauth_state(user_id),
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    data = {
        "code": code,
        "client_id": os.environ["GOOGLE_OAUTH_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_OAUTH_CLIENT_SECRET"],
        "redirect_uri": redirect_uri(),
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(GOOGLE_TOKEN_URL, data=data)
        response.raise_for_status()
        return response.json()


async def refresh_access_token(refresh_token: str) -> str:
    data = {
        "client_id": os.environ["GOOGLE_OAUTH_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_OAUTH_CLIENT_SECRET"],
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(GOOGLE_TOKEN_URL, data=data)
        response.raise_for_status()
        payload = response.json()
    access = payload.get("access_token")
    if not access:
        raise RuntimeError("Google did not return an access_token")
    return access


async def revoke_token(token: str) -> bool:
    """Revoke a refresh or access token at Google. Returns False if Google refused."""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(GOOGLE_REVOKE_URL, data={"token": token})
    return response.status_code < 400


def _parse_event(raw: dict[str, Any]) -> dict[str, Any]:
    start = raw.get("start") or {}
    end = raw.get("end") or {}
    all_day = "date" in start and "dateTime" not in start
    return {
        "id": raw.get("id"),
        "title": raw.get("summary") or "(No title)",
        "start": start.get("dateTime") or start.get("date"),
        "end": end.get("dateTime") or end.get("date"),
        "all_day": all_day,
        "location": raw.get("location"),
        "description": raw.get("description"),
        "status": raw.get("status"),
        "html_link": raw.get("htmlLink"),
        "hangout_link": raw.get("hangoutLink"),
    }


def _resolve_timezone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except Exception:
        return ZoneInfo("America/Chicago")


def event_local_date(event: dict[str, Any], timezone_name: str = "America/Chicago") -> str:
    """Local calendar date (YYYY-MM-DD) for an event's start."""
    start = str(event.get("start") or "")
    if event.get("all_day") or ("T" not in start and len(start) >= 10):
        return start[:10]
    try:
        tz = _resolve_timezone(timezone_name)
        dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
        return dt.astimezone(tz).date().isoformat()
    except Exception:
        return start[:10] if len(start) >= 10 else start


async def fetch_events_for_range(
    refresh_token: str,
    *,
    start_day: date,
    end_day: date,
    timezone_name: str = "America/Chicago",
    max_results: int = 250,
) -> list[dict[str, Any]]:
    """Fetch primary-calendar events overlapping [start_day, end_day] inclusive."""
    if end_day < start_day:
        raise ValueError("end_day must be on or after start_day")

    access_token = await refresh_access_token(refresh_token)
    tz = _resolve_timezone(timezone_name)
    start_local = datetime(start_day.year, start_day.month, start_day.day, tzinfo=tz)
    # Exclusive end: midnight after end_day.
    end_local = datetime(end_day.year, end_day.month, end_day.day, tzinfo=tz) + timedelta(days=1)

    params = {
        "timeMin": start_local.isoformat(),
        "timeMax": end_local.isoformat(),
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": max_results,
        "timeZone": timezone_name,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            GOOGLE_EVENTS_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
        )
        response.raise_for_status()
        payload = response.json()

    items = payload.get("items") or []
    events = [_parse_event(item) for item in items if item.get("status") != "cancelled"]
    for event in events:
        event["date"] = event_local_date(event, timezone_name)
    return events


async def fetch_events_for_day(
    refresh_token: str,
    *,
    day: date,
    timezone_name: str = "America/Chicago",
) -> list[dict[str, Any]]:
    """Fetch primary-calendar events overlapping the given local calendar day."""
    return await fetch_events_for_range(
        refresh_token,
        start_day=day,
        end_day=day,
        timezone_name=timezone_name,
        max_results=50,
    )


def _event_times(
    start: str, end: str | None, all_day: bool, timezone_name: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Google start/end objects. The unused field is sent as null so PATCH clears it."""
    if all_day:
        first = date.fromisoformat(start[:10])
        last = date.fromisoformat(end[:10]) if end else first
        # Google's all-day end date is exclusive
        last = max(last, first) + timedelta(days=1)
        return (
            {"date": first.isoformat(), "dateTime": None, "timeZone": None},
            {"date": last.isoformat(), "dateTime": None, "timeZone": None},
        )

    start_dt = datetime.fromisoformat(start)
    end_dt = datetime.fromisoformat(end) if end else start_dt + timedelta(hours=1)
    if end_dt <= start_dt:
        raise ValueError("end must be after start")
    tz = timezone_name if start_dt.tzinfo is None else None
    return (
        {"dateTime": start_dt.isoformat(), "timeZone": tz, "date": None},
        {"dateTime": end_dt.isoformat(), "timeZone": tz, "date": None},
    )


async def update_event(
    refresh_token: str,
    event_id: str,
    *,
    title: str,
    start: str,
    end: str | None,
    all_day: bool,
    location: str | None,
    description: str | None,
    timezone_name: str = "America/Chicago",
) -> dict[str, Any]:
    """Change an existing primary-calendar event in Google and return it parsed."""
    start_obj, end_obj = _event_times(start, end, all_day, timezone_name)
    body = {
        "summary": title,
        "start": start_obj,
        "end": end_obj,
        "location": location or None,
        "description": description or None,
    }
    access_token = await refresh_access_token(refresh_token)
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.patch(
            f"{GOOGLE_EVENTS_URL}/{quote(event_id, safe='')}",
            headers={"Authorization": f"Bearer {access_token}"},
            json=body,
        )
        response.raise_for_status()
        event = _parse_event(response.json())
    event["date"] = event_local_date(event, timezone_name)
    return event


async def delete_event(refresh_token: str, event_id: str) -> None:
    """Delete a primary-calendar event in Google. Already gone counts as done."""
    access_token = await refresh_access_token(refresh_token)
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.delete(
            f"{GOOGLE_EVENTS_URL}/{quote(event_id, safe='')}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if response.status_code in (404, 410):
        return
    response.raise_for_status()


def events_to_summary(events: list[dict[str, Any]] | None) -> str | None:
    if not events:
        return None
    parts: list[str] = []
    for event in events:
        title = event.get("title") or "(No title)"
        start = event.get("start") or "?"
        end = event.get("end") or "?"
        location = event.get("location")
        if event.get("all_day"):
            line = f"{title} (all day {start})"
        else:
            line = f"{title} ({start} → {end})"
        if location:
            line += f" @ {location}"
        parts.append(line)
    return "; ".join(parts)


def format_events_for_prompt(events: list[dict[str, Any]] | None) -> str:
    if not events:
        return "none"
    lines: list[str] = []
    for i, event in enumerate(events, start=1):
        lines.append(
            f"{i}. title={event.get('title')!r}, start={event.get('start')}, "
            f"end={event.get('end')}, all_day={event.get('all_day')}, "
            f"location={event.get('location')!r}, "
            f"description={event.get('description')!r}, status={event.get('status')}"
        )
    return "\n".join(lines)
