"""Google Calendar connect / status / event preview routes."""

from __future__ import annotations

import uuid
from datetime import date as Date
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.deps import get_current_user
from api.errors import api_error
from db.database import get_db
from db.models import User
from services import google_calendar as gcal

router = APIRouter(prefix="/calendar", tags=["calendar"])


class CalendarStatus(BaseModel):
    connected: bool
    configured: bool
    email: Optional[str] = None
    connected_at: Optional[str] = None
    # Frontend CalendarContext reads camelCase; keep snake_case for API docs too.
    connectedAt: Optional[str] = None


def _status_for(user: User | None = None, *, connected: bool | None = None) -> CalendarStatus:
    connected_flag = (
        bool(user.google_calendar_refresh_token) if connected is None and user is not None else bool(connected)
    )
    email = user.google_calendar_email if user is not None else None
    connected_at = None
    if user is not None and user.google_calendar_connected_at is not None:
        connected_at = user.google_calendar_connected_at.isoformat()
    return CalendarStatus(
        connected=connected_flag,
        configured=gcal.oauth_configured(),
        email=email if connected_flag else None,
        connected_at=connected_at if connected_flag else None,
        connectedAt=connected_at if connected_flag else None,
    )


class ConnectResponse(BaseModel):
    auth_url: str
    # Where Google sends the browser after OAuth (API page; no Vite required).
    landing_url: str = "http://127.0.0.1:8000/v1/calendar/oauth-done"


class ManualEventsRequest(BaseModel):
    """Dev/test helper: store structured events without Google OAuth."""

    date: Optional[Date] = None
    events: list[dict[str, Any]] = Field(default_factory=list)


@router.get("/status", response_model=CalendarStatus)
def calendar_status(user: User = Depends(get_current_user)) -> CalendarStatus:
    return _status_for(user)


@router.get("/connect", response_model=ConnectResponse)
@router.get("/auth-url", response_model=ConnectResponse, include_in_schema=False)
def calendar_connect(user: User = Depends(get_current_user)) -> ConnectResponse:
    # /auth-url is an alias for clients that expect that path name (same handler as /connect).
    landing = gcal.frontend_redirect_url()
    if not gcal.oauth_configured():
        raise api_error(
            503,
            "Google Calendar OAuth is not configured on the server. "
            "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
            "CALENDAR_NOT_CONFIGURED",
        )
    try:
        url = gcal.build_auth_url(str(user.id))
        return ConnectResponse(auth_url=url, landing_url=landing)
    except Exception as exc:
        raise api_error(502, str(exc), "CALENDAR_OAUTH_ERROR") from exc


@router.get("/oauth-done", response_class=HTMLResponse, include_in_schema=False)
def calendar_oauth_done(
    calendar: Optional[str] = Query(None),
    reason: Optional[str] = Query(None),
) -> HTMLResponse:
    """Landing page after Google OAuth (works without the Vite frontend)."""
    ok = calendar == "connected"
    title = "Calendar connected" if ok else "Calendar connection failed"
    detail = "You can close this tab and return to the app." if ok else f"Reason: {reason or 'unknown'}"
    color = "#0a7" if ok else "#c33"
    # Notify opener (popup OAuth) then try to close — frontend also polls /status.
    payload = "connected" if ok else "error"
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem">
  <h1 style="color:{color}">{title}</h1>
  <p>{detail}</p>
  <p><a href="/docs">API docs</a></p>
  <script>
    try {{
      if (window.opener) {{
        window.opener.postMessage({{ type: "google-calendar-{payload}" }}, "*");
      }}
    }} catch (e) {{}}
    try {{ window.close(); }} catch (e) {{}}
  </script>
</body></html>"""
    return HTMLResponse(html)


@router.get("/callback")
async def calendar_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
):
    frontend = gcal.frontend_redirect_url()

    def _redir(params: dict) -> RedirectResponse:
        sep = "&" if "?" in frontend else "?"
        # Hash routes (Vite) need query before hash; plain API URLs use normal query.
        if "#" in frontend:
            base, frag = frontend.split("#", 1)
            url = f"{base}?{urlencode(params)}#{frag}"
        else:
            url = f"{frontend}{sep}{urlencode(params)}"
        return RedirectResponse(url)

    if error:
        return _redir({"calendar": "error", "reason": error})
    if not code or not state:
        return _redir({"calendar": "error", "reason": "missing_code"})

    user_id = gcal.decode_oauth_state(state)
    if not user_id:
        return _redir({"calendar": "error", "reason": "invalid_state"})

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        return _redir({"calendar": "error", "reason": "invalid_user"})

    user = db.get(User, user_uuid)
    if user is None:
        return _redir({"calendar": "error", "reason": "user_not_found"})

    try:
        tokens = await gcal.exchange_code_for_tokens(code)
        refresh = tokens.get("refresh_token")
        if not refresh:
            # Google only returns refresh_token on first consent; keep existing if re-auth.
            refresh = user.google_calendar_refresh_token
        if not refresh:
            return _redir({"calendar": "error", "reason": "no_refresh_token"})

        user.google_calendar_refresh_token = refresh
        user.google_calendar_connected_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        return _redir({"calendar": "error", "reason": "token_exchange_failed"})

    return _redir({"calendar": "connected"})


@router.delete("/disconnect", response_model=CalendarStatus)
async def calendar_disconnect(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CalendarStatus:
    # Revoke at Google so disconnecting really ends access (privacy policy promise).
    # Best effort: still clear our copy if Google is unreachable or the token is already dead.
    if user.google_calendar_refresh_token:
        try:
            await gcal.revoke_token(user.google_calendar_refresh_token)
        except Exception:
            pass
    user.google_calendar_refresh_token = None
    user.google_calendar_email = None
    user.google_calendar_connected_at = None
    db.commit()
    return _status_for(connected=False)


def _calendar_fetch_error(exc: Exception) -> Exception:
    reason = str(exc).strip()
    if hasattr(exc, "response") and getattr(exc, "response", None) is not None:
        try:
            payload = exc.response.json()
            reason = (
                payload.get("error", {}).get("message")
                or payload.get("error_description")
                or reason
            )
        except Exception:
            reason = (exc.response.text or reason)[:300]
    detail = "Failed to fetch Google Calendar events"
    if reason:
        detail = f"{detail}: {reason}"
    return api_error(502, detail, "CALENDAR_FETCH_ERROR")


@router.get("/events")
async def list_calendar_events(
    day: Optional[Date] = Query(None, alias="date", description="YYYY-MM-DD (default: tomorrow)"),
    from_date: Optional[Date] = Query(
        None, alias="from", description="Range start YYYY-MM-DD (inclusive)"
    ),
    to_date: Optional[Date] = Query(
        None, alias="to", description="Range end YYYY-MM-DD (inclusive)"
    ),
    timezone_name: str = Query("America/Chicago", alias="timezone"),
    user: User = Depends(get_current_user),
) -> dict:
    """Preview events for one day (`date`) or a month/range (`from` + `to`)."""
    from datetime import timedelta

    if not user.google_calendar_refresh_token:
        raise api_error(
            404,
            "Google Calendar is not connected. Call GET /v1/calendar/connect first.",
            "CALENDAR_NOT_CONNECTED",
        )

    if (from_date is None) ^ (to_date is None):
        raise api_error(
            400,
            "Provide both `from` and `to`, or use `date` for a single day.",
            "VALIDATION_ERROR",
        )

    if from_date is not None and to_date is not None:
        if to_date < from_date:
            raise api_error(400, "`to` must be on or after `from`.", "VALIDATION_ERROR")
        if (to_date - from_date).days > 62:
            raise api_error(
                400,
                "Date range cannot exceed 62 days. Request one month at a time.",
                "VALIDATION_ERROR",
            )
        try:
            events = await gcal.fetch_events_for_range(
                user.google_calendar_refresh_token,
                start_day=from_date,
                end_day=to_date,
                timezone_name=timezone_name,
            )
        except Exception as exc:
            raise _calendar_fetch_error(exc) from exc

        return {
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
            "timezone": timezone_name,
            "events": events,
            "summary": gcal.events_to_summary(events),
        }

    target = day or (Date.today() + timedelta(days=1))
    try:
        events = await gcal.fetch_events_for_day(
            user.google_calendar_refresh_token,
            day=target,
            timezone_name=timezone_name,
        )
    except Exception as exc:
        raise _calendar_fetch_error(exc) from exc

    return {
        "date": target.isoformat(),
        "timezone": timezone_name,
        "events": events,
        "summary": gcal.events_to_summary(events),
    }


class EventUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    start: str = Field(description="YYYY-MM-DD for all-day, else YYYY-MM-DDTHH:MM local time")
    end: Optional[str] = None
    all_day: bool = False
    location: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    timezone: str = "America/Chicago"


def _calendar_write_error(exc: Exception) -> Exception:
    response = getattr(exc, "response", None)
    status = getattr(response, "status_code", None)
    text = ""
    if response is not None:
        try:
            text = response.text or ""
        except Exception:
            text = ""
    if status in (401, 403) and "insufficient" in text.lower():
        # tokens granted before editing existed only carry the read-only scope
        return api_error(
            403,
            "Reconnect Google Calendar to allow editing from Lobelia.",
            "CALENDAR_RECONNECT_NEEDED",
        )
    if status == 403:
        return api_error(
            403,
            "Google didn't allow this change. You can only edit events on calendars you own.",
            "CALENDAR_EDIT_FORBIDDEN",
        )
    if status in (404, 410):
        return api_error(404, "This event no longer exists in Google Calendar.", "CALENDAR_EVENT_NOT_FOUND")
    return _calendar_fetch_error(exc)


def _require_connected(user: User) -> str:
    if not user.google_calendar_refresh_token:
        raise api_error(
            404,
            "Google Calendar is not connected. Call GET /v1/calendar/connect first.",
            "CALENDAR_NOT_CONNECTED",
        )
    return user.google_calendar_refresh_token


@router.patch("/events/{event_id}")
async def update_calendar_event(
    event_id: str,
    body: EventUpdate,
    user: User = Depends(get_current_user),
) -> dict:
    """Edit an existing Google Calendar event; the change is saved in Google."""
    refresh_token = _require_connected(user)
    try:
        event = await gcal.update_event(
            refresh_token,
            event_id,
            title=body.title.strip(),
            start=body.start,
            end=body.end,
            all_day=body.all_day,
            location=(body.location or "").strip() or None,
            description=(body.description or "").strip() or None,
            timezone_name=body.timezone,
        )
    except ValueError as exc:
        raise api_error(400, str(exc), "VALIDATION_ERROR") from exc
    except Exception as exc:
        raise _calendar_write_error(exc) from exc
    return {"event": event}


@router.delete("/events/{event_id}", status_code=204)
async def delete_calendar_event(
    event_id: str,
    user: User = Depends(get_current_user),
) -> None:
    """Delete a Google Calendar event; it is removed in Google too."""
    refresh_token = _require_connected(user)
    try:
        await gcal.delete_event(refresh_token, event_id)
    except Exception as exc:
        raise _calendar_write_error(exc) from exc


@router.post("/manual-events", status_code=201)
def save_manual_events(
    body: ManualEventsRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Store structured calendar events on today's check-in without Google OAuth.

    Useful for local/dev testing of the LLM calendar context.
    """
    from services.check_in_service import get_or_create_check_in

    day = body.date or Date.today()
    check_in = get_or_create_check_in(db, user.id, day)
    stamped = []
    for event in body.events:
        item = dict(event)
        item.setdefault("source", "manual")
        stamped.append(item)
    check_in.calendar_events = stamped
    check_in.calendar_event = gcal.events_to_summary(stamped)
    db.commit()
    db.refresh(check_in)
    return {
        "date": day.isoformat(),
        "events": check_in.calendar_events or [],
        "summary": check_in.calendar_event,
    }
