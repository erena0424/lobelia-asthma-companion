"""Google Calendar API tests (OAuth mocked; manual events path covered)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def test_calendar_status_disconnected(client: TestClient, auth_headers: dict):
    response = client.get("/v1/calendar/status", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["connected"] is False
    assert "configured" in body


def test_calendar_connect_requires_oauth_config(client: TestClient, auth_headers: dict, monkeypatch):
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_CLIENT_SECRET", raising=False)
    response = client.get("/v1/calendar/connect", headers=auth_headers)
    assert response.status_code == 503
    assert response.json()["code"] == "CALENDAR_NOT_CONFIGURED"


def test_calendar_connect_returns_auth_url(client: TestClient, auth_headers: dict, monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    response = client.get("/v1/calendar/connect", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert "accounts.google.com" in response.json()["auth_url"]
    auth_url = response.json()["auth_url"]
    # Narrowest scope that allows edits (Google verification): owned events only, nothing broader.
    assert "calendar.events.owned" in auth_url
    assert "calendar.events.owned.readonly" not in auth_url
    assert "calendar.readonly" not in auth_url
    assert "include_granted_scopes" not in auth_url


def test_calendar_auth_url_alias(client: TestClient, auth_headers: dict, monkeypatch):
    """Alias for clients that call /auth-url instead of /connect."""
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    response = client.get("/v1/calendar/auth-url", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert "accounts.google.com" in response.json()["auth_url"]


def test_manual_events_then_forecast_uses_them(
    client: TestClient,
    auth_headers: dict,
    mock_env_fetch,
    mock_advice,
):
    events = [
        {
            "id": "e1",
            "title": "Outdoor soccer",
            "start": "2026-07-17T09:00:00-05:00",
            "end": "2026-07-17T10:30:00-05:00",
            "all_day": False,
            "location": "Madison park",
            "description": "Scrimmage",
            "status": "confirmed",
        }
    ]
    manual = client.post(
        "/v1/calendar/manual-events",
        json={"events": events},
        headers=auth_headers,
    )
    assert manual.status_code == 201, manual.text
    assert "Outdoor soccer" in (manual.json().get("summary") or "")

    client.post("/v1/check-ins/inhaler/puff", headers=auth_headers)

    with patch("services.forecast_service.fetch_env_daily", side_effect=mock_env_fetch.side_effect):
        with patch("services.forecast_service.generate_advice", side_effect=mock_advice.side_effect) as advice_mock:
            response = client.post(
                "/v1/forecast",
                json={"lat": 43.07, "lon": -89.40},
                headers=auth_headers,
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["calendar_source"] in ("check_in", "request", "google_calendar", "manual")
            assert any(e.get("title") == "Outdoor soccer" for e in body.get("calendar_events", []))
            assert advice_mock.called
            kwargs = advice_mock.call_args.kwargs
            assert kwargs.get("calendar_events")
            assert kwargs["calendar_events"][0]["title"] == "Outdoor soccer"


def test_forecast_calendar_events_override(
    client: TestClient,
    auth_headers: dict,
    mock_env_fetch,
    mock_advice,
):
    client.post("/v1/check-ins", json={}, headers=auth_headers)
    events = [
        {
            "title": "Morning run",
            "start": "2026-07-17T07:00:00-05:00",
            "end": "2026-07-17T07:45:00-05:00",
            "all_day": False,
            "location": "Lakeshore path",
        }
    ]
    with patch("services.forecast_service.fetch_env_daily", side_effect=mock_env_fetch.side_effect):
        with patch("services.forecast_service.generate_advice", side_effect=mock_advice.side_effect):
            response = client.post(
                "/v1/forecast",
                json={"lat": 43.07, "lon": -89.40, "calendar_events": events},
                headers=auth_headers,
            )
    assert response.status_code == 200, response.text
    assert response.json()["calendar_source"] == "request"
    assert response.json()["calendar_events"][0]["title"] == "Morning run"


@patch("services.google_calendar.fetch_events_for_day", new_callable=AsyncMock)
def test_list_events_when_connected(
    mock_fetch,
    client: TestClient,
    auth_headers: dict,
    db_session,
):
    from db.models import User
    from sqlalchemy import select

    mock_fetch.return_value = [
        {"title": "Lecture", "start": "2026-07-17", "end": "2026-07-17", "all_day": True, "date": "2026-07-17"}
    ]
    # Attach a fake refresh token to the auth user
    me = client.get("/v1/users/me", headers=auth_headers).json()
    user = db_session.scalar(select(User).where(User.email == me["email"]))
    assert user is not None
    user.google_calendar_refresh_token = "fake-refresh"
    db_session.commit()

    response = client.get("/v1/calendar/events?date=2026-07-17", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert response.json()["events"][0]["title"] == "Lecture"
    mock_fetch.assert_awaited()



def test_calendar_status_includes_camel_case_alias(client: TestClient, auth_headers: dict, db_session):
    from datetime import datetime, timezone

    from db.models import User
    from sqlalchemy import select

    me = client.get("/v1/users/me", headers=auth_headers).json()
    user = db_session.scalar(select(User).where(User.email == me["email"]))
    assert user is not None
    user.google_calendar_refresh_token = "fake-refresh"
    user.google_calendar_email = "cal@example.com"
    user.google_calendar_connected_at = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
    db_session.commit()

    response = client.get("/v1/calendar/status", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["connected"] is True
    assert body["email"] == "cal@example.com"
    assert body["connected_at"]
    assert body["connectedAt"] == body["connected_at"]


@patch("services.google_calendar.fetch_events_for_range", new_callable=AsyncMock)
def test_list_events_range_for_month(
    mock_fetch,
    client: TestClient,
    auth_headers: dict,
    db_session,
):
    from db.models import User
    from sqlalchemy import select

    mock_fetch.return_value = [
        {
            "title": "Lab",
            "start": "2026-08-05T10:00:00-05:00",
            "end": "2026-08-05T11:00:00-05:00",
            "all_day": False,
            "date": "2026-08-05",
        }
    ]
    me = client.get("/v1/users/me", headers=auth_headers).json()
    user = db_session.scalar(select(User).where(User.email == me["email"]))
    assert user is not None
    user.google_calendar_refresh_token = "fake-refresh"
    db_session.commit()

    response = client.get(
        "/v1/calendar/events?from=2026-08-01&to=2026-08-31",
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["from"] == "2026-08-01"
    assert body["to"] == "2026-08-31"
    assert body["events"][0]["date"] == "2026-08-05"
    mock_fetch.assert_awaited()


def test_list_events_range_requires_both_bounds(client: TestClient, auth_headers: dict, db_session):
    from db.models import User
    from sqlalchemy import select

    me = client.get("/v1/users/me", headers=auth_headers).json()
    user = db_session.scalar(select(User).where(User.email == me["email"]))
    assert user is not None
    user.google_calendar_refresh_token = "fake-refresh"
    db_session.commit()

    response = client.get("/v1/calendar/events?from=2026-08-01", headers=auth_headers)
    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


def _connect_fake_calendar(client: TestClient, auth_headers: dict, db_session):
    from db.models import User
    from sqlalchemy import select

    me = client.get("/v1/users/me", headers=auth_headers).json()
    user = db_session.scalar(select(User).where(User.email == me["email"]))
    assert user is not None
    user.google_calendar_refresh_token = "fake-refresh"
    db_session.commit()
    return user


@patch("services.google_calendar.revoke_token", new_callable=AsyncMock)
def test_disconnect_revokes_token_at_google(mock_revoke, client: TestClient, auth_headers: dict, db_session):
    user = _connect_fake_calendar(client, auth_headers, db_session)
    mock_revoke.return_value = True

    response = client.delete("/v1/calendar/disconnect", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert response.json()["connected"] is False
    mock_revoke.assert_awaited_once_with("fake-refresh")
    db_session.refresh(user)
    assert user.google_calendar_refresh_token is None


@patch("services.google_calendar.revoke_token", new_callable=AsyncMock)
def test_disconnect_clears_token_even_if_revoke_fails(mock_revoke, client: TestClient, auth_headers: dict, db_session):
    user = _connect_fake_calendar(client, auth_headers, db_session)
    mock_revoke.side_effect = RuntimeError("google unreachable")

    response = client.delete("/v1/calendar/disconnect", headers=auth_headers)
    assert response.status_code == 200, response.text
    db_session.refresh(user)
    assert user.google_calendar_refresh_token is None


@patch("services.google_calendar.revoke_token", new_callable=AsyncMock)
def test_disconnect_without_connection_skips_revoke(mock_revoke, client: TestClient, auth_headers: dict):
    response = client.delete("/v1/calendar/disconnect", headers=auth_headers)
    assert response.status_code == 200, response.text
    mock_revoke.assert_not_awaited()


def _google_error(status: int, body: str):
    import httpx

    request = httpx.Request("PATCH", "https://www.googleapis.com/calendar/v3/calendars/primary/events/x")
    response = httpx.Response(status, text=body, request=request)
    return httpx.HTTPStatusError("google error", request=request, response=response)


@patch("services.google_calendar.update_event", new_callable=AsyncMock)
def test_update_event_saves_to_google(mock_update, client: TestClient, auth_headers: dict, db_session):
    _connect_fake_calendar(client, auth_headers, db_session)
    mock_update.return_value = {"id": "evt1", "title": "Run", "start": "2026-10-26T18:00:00-05:00", "date": "2026-10-26"}

    response = client.patch(
        "/v1/calendar/events/evt1",
        headers=auth_headers,
        json={
            "title": " Run ",
            "start": "2026-10-26T18:00",
            "end": "2026-10-26T19:00",
            "location": "Lakeshore Path",
            "timezone": "America/Chicago",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["event"]["title"] == "Run"
    args, kwargs = mock_update.await_args
    assert args == ("fake-refresh", "evt1")
    assert kwargs["title"] == "Run"
    assert kwargs["all_day"] is False
    assert kwargs["location"] == "Lakeshore Path"
    assert kwargs["description"] is None


def test_update_event_requires_connection(client: TestClient, auth_headers: dict):
    response = client.patch(
        "/v1/calendar/events/evt1", headers=auth_headers, json={"title": "Run", "start": "2026-10-26"}
    )
    assert response.status_code == 404
    assert response.json()["code"] == "CALENDAR_NOT_CONNECTED"


@patch("services.google_calendar.update_event", new_callable=AsyncMock)
def test_update_event_with_read_only_token_asks_to_reconnect(
    mock_update, client: TestClient, auth_headers: dict, db_session
):
    _connect_fake_calendar(client, auth_headers, db_session)
    mock_update.side_effect = _google_error(403, '{"error": {"message": "Request had insufficient authentication scopes."}}')

    response = client.patch(
        "/v1/calendar/events/evt1", headers=auth_headers, json={"title": "Run", "start": "2026-10-26"}
    )
    assert response.status_code == 403
    assert response.json()["code"] == "CALENDAR_RECONNECT_NEEDED"


@patch("services.google_calendar.update_event", new_callable=AsyncMock)
def test_update_event_not_owned_is_forbidden(mock_update, client: TestClient, auth_headers: dict, db_session):
    _connect_fake_calendar(client, auth_headers, db_session)
    mock_update.side_effect = _google_error(403, '{"error": {"message": "Forbidden"}}')

    response = client.patch(
        "/v1/calendar/events/evt1", headers=auth_headers, json={"title": "Run", "start": "2026-10-26"}
    )
    assert response.status_code == 403
    assert response.json()["code"] == "CALENDAR_EDIT_FORBIDDEN"


@patch("services.google_calendar.update_event", new_callable=AsyncMock)
def test_update_event_bad_times_is_validation_error(mock_update, client: TestClient, auth_headers: dict, db_session):
    _connect_fake_calendar(client, auth_headers, db_session)
    mock_update.side_effect = ValueError("end must be after start")

    response = client.patch(
        "/v1/calendar/events/evt1",
        headers=auth_headers,
        json={"title": "Run", "start": "2026-10-26T18:00", "end": "2026-10-26T17:00"},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"


@patch("services.google_calendar.delete_event", new_callable=AsyncMock)
def test_delete_event_removes_it_in_google(mock_delete, client: TestClient, auth_headers: dict, db_session):
    _connect_fake_calendar(client, auth_headers, db_session)

    response = client.delete("/v1/calendar/events/evt1", headers=auth_headers)
    assert response.status_code == 204, response.text
    mock_delete.assert_awaited_once_with("fake-refresh", "evt1")


@patch("services.google_calendar.delete_event", new_callable=AsyncMock)
def test_delete_missing_event_is_not_found(mock_delete, client: TestClient, auth_headers: dict, db_session):
    _connect_fake_calendar(client, auth_headers, db_session)
    mock_delete.side_effect = _google_error(404, "Not Found")

    response = client.delete("/v1/calendar/events/evt1", headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["code"] == "CALENDAR_EVENT_NOT_FOUND"
