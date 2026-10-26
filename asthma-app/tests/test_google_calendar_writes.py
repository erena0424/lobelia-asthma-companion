"""google_calendar write helpers: the request bodies sent to Google (HTTP mocked)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from services import google_calendar as gcal


class _FakeClient:
    """Stands in for httpx.AsyncClient and records the one request made."""

    calls: list[tuple[str, str, dict]] = []
    status = 200
    payload: dict = {}

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def _respond(self, method: str, url: str, **kwargs):
        _FakeClient.calls.append((method, url, kwargs))
        request = httpx.Request(method, url)
        return httpx.Response(_FakeClient.status, json=_FakeClient.payload, request=request)

    async def patch(self, url, **kwargs):
        return self._respond("PATCH", url, **kwargs)

    async def delete(self, url, **kwargs):
        return self._respond("DELETE", url, **kwargs)


@pytest.fixture
def fake_google(monkeypatch):
    _FakeClient.calls = []
    _FakeClient.status = 200
    _FakeClient.payload = {}
    monkeypatch.setattr(gcal.httpx, "AsyncClient", _FakeClient)
    with patch.object(gcal, "refresh_access_token", new=AsyncMock(return_value="access")):
        yield _FakeClient


@pytest.mark.asyncio
async def test_update_timed_event_sends_local_times_with_timezone(fake_google):
    fake_google.payload = {
        "id": "evt/1",
        "summary": "Run",
        "start": {"dateTime": "2026-10-26T18:00:00-05:00"},
        "end": {"dateTime": "2026-10-26T19:00:00-05:00"},
    }
    event = await gcal.update_event(
        "refresh",
        "evt/1",
        title="Run",
        start="2026-10-26T18:00",
        end="2026-10-26T19:00",
        all_day=False,
        location=None,
        description=None,
        timezone_name="America/Chicago",
    )
    method, url, kwargs = fake_google.calls[0]
    assert method == "PATCH"
    assert url.endswith("/events/evt%2F1")
    body = kwargs["json"]
    assert body["start"] == {"dateTime": "2026-10-26T18:00:00", "timeZone": "America/Chicago", "date": None}
    assert body["end"]["dateTime"] == "2026-10-26T19:00:00"
    assert body["location"] is None
    assert event["title"] == "Run"
    assert event["date"] == "2026-10-26"


@pytest.mark.asyncio
async def test_update_all_day_event_uses_exclusive_end_date(fake_google):
    fake_google.payload = {"id": "e", "summary": "Hike", "start": {"date": "2026-10-27"}, "end": {"date": "2026-10-28"}}
    await gcal.update_event(
        "refresh", "e", title="Hike", start="2026-10-27", end=None, all_day=True, location="State park", description=None
    )
    body = fake_google.calls[0][2]["json"]
    assert body["start"] == {"date": "2026-10-27", "dateTime": None, "timeZone": None}
    assert body["end"] == {"date": "2026-10-28", "dateTime": None, "timeZone": None}
    assert body["location"] == "State park"


@pytest.mark.asyncio
async def test_update_without_end_defaults_to_one_hour(fake_google):
    fake_google.payload = {"id": "e", "start": {"dateTime": "2026-10-26T09:00:00-05:00"}}
    await gcal.update_event(
        "refresh", "e", title="Class", start="2026-10-26T09:00", end=None, all_day=False, location=None, description=None
    )
    assert fake_google.calls[0][2]["json"]["end"]["dateTime"] == "2026-10-26T10:00:00"


@pytest.mark.asyncio
async def test_update_rejects_end_before_start(fake_google):
    with pytest.raises(ValueError):
        await gcal.update_event(
            "refresh", "e", title="Class", start="2026-10-26T09:00", end="2026-10-26T08:00",
            all_day=False, location=None, description=None,
        )
    assert fake_google.calls == []


@pytest.mark.asyncio
async def test_delete_event_treats_already_gone_as_done(fake_google):
    fake_google.status = 410
    await gcal.delete_event("refresh", "e")
    assert fake_google.calls[0][0] == "DELETE"


@pytest.mark.asyncio
async def test_delete_event_raises_on_forbidden(fake_google):
    fake_google.status = 403
    with pytest.raises(httpx.HTTPStatusError):
        await gcal.delete_event("refresh", "e")
