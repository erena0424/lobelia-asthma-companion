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

    async def post(self, url, **kwargs):
        return self._respond("POST", url, **kwargs)

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


@pytest.mark.asyncio
async def test_create_timed_event_posts_only_title_time_and_location(fake_google):
    fake_google.payload = {
        "id": "new1",
        "summary": "Soccer practice",
        "start": {"dateTime": "2026-10-30T18:00:00-05:00"},
        "end": {"dateTime": "2026-10-30T19:30:00-05:00"},
        "location": "Field 3",
    }
    event = await gcal.create_event(
        "refresh",
        title="Soccer practice",
        start="2026-10-30T18:00",
        end="2026-10-30T19:30",
        all_day=False,
        location="Field 3",
        timezone_name="America/Chicago",
    )
    method, url, kwargs = fake_google.calls[0]
    assert method == "POST"
    assert url == gcal.GOOGLE_EVENTS_URL
    assert kwargs["json"] == {
        "summary": "Soccer practice",
        "start": {"dateTime": "2026-10-30T18:00:00", "timeZone": "America/Chicago"},
        "end": {"dateTime": "2026-10-30T19:30:00", "timeZone": "America/Chicago"},
        "location": "Field 3",
    }
    assert event["id"] == "new1"
    assert event["date"] == "2026-10-30"


@pytest.mark.asyncio
async def test_create_all_day_event_without_location(fake_google):
    fake_google.payload = {"id": "new2", "summary": "Hike", "start": {"date": "2026-10-31"}, "end": {"date": "2026-11-01"}}
    event = await gcal.create_event("refresh", title="Hike", start="2026-10-31", end=None, all_day=True, location=None)
    assert fake_google.calls[0][2]["json"] == {
        "summary": "Hike",
        "start": {"date": "2026-10-31"},
        "end": {"date": "2026-11-01"},
    }
    assert event["all_day"] is True
    assert event["date"] == "2026-10-31"


@pytest.mark.asyncio
async def test_create_event_raises_when_google_refuses(fake_google):
    fake_google.status = 403
    with pytest.raises(httpx.HTTPStatusError):
        await gcal.create_event("refresh", title="Run", start="2026-10-30", end=None, all_day=True, location=None)


@pytest.mark.asyncio
async def test_update_without_description_keeps_googles(fake_google):
    fake_google.payload = {"id": "e", "start": {"date": "2026-10-27"}}
    await gcal.update_event("refresh", "e", title="Hike", start="2026-10-27", end=None, all_day=True, location=None)
    assert "description" not in fake_google.calls[0][2]["json"]


def test_synced_copies_of_lobelia_plans_are_dropped():
    google = [{"id": "g1", "title": "Lecture"}, {"id": "g2", "title": "Soccer practice"}]
    own = [{"id": "manual-1", "title": "Soccer practice", "google_event_id": "g2"}, {"id": "manual-2"}]
    assert gcal.without_synced_copies(google, own) == [{"id": "g1", "title": "Lecture"}]
    assert gcal.without_synced_copies(google, None) == google
