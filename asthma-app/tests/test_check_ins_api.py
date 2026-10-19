"""Check-in and inhaler API tests."""

from datetime import date, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient


def test_check_in_defaults_and_puff(client: TestClient, auth_headers: dict):
    create = client.post(
        "/v1/check-ins",
        json={},
        headers=auth_headers,
    )
    assert create.status_code == 201
    body = create.json()
    assert body["daily_day_symp"] is False
    assert body["daily_night_symp"] is False
    assert body["daily_limit_activity"] is False
    assert body["symptoms_logged"] is True
    assert body["puffs_today"] == 0
    assert body["symptom_burden_score"] == 0

    puff = client.post("/v1/check-ins/inhaler/puff", headers=auth_headers)
    assert puff.status_code == 200
    assert puff.json()["puffs_today"] == 1

    manual = client.put(
        "/v1/check-ins/inhaler",
        json={"puffs_today": 4},
        headers=auth_headers,
    )
    assert manual.status_code == 200
    assert manual.json()["puffs_today"] == 4
    assert manual.json()["is_flare_up_threshold"] is True


def test_today_check_in_endpoint(client: TestClient, auth_headers: dict):
    response = client.get("/v1/check-ins/today", headers=auth_headers)
    assert response.status_code == 200
    assert "puffs_today" in response.json()


def test_list_check_ins_with_date_range(client: TestClient, auth_headers: dict):
    today = date.today()
    yesterday = today - timedelta(days=1)
    assert client.post(
        "/v1/check-ins",
        json={"date": yesterday.isoformat(), "daily_night_symp": True},
        headers=auth_headers,
    ).status_code == 201
    assert client.post("/v1/check-ins/inhaler/puff", headers=auth_headers).status_code == 200

    listed = client.get(
        "/v1/check-ins",
        params={"from": yesterday.isoformat(), "to": today.isoformat()},
        headers=auth_headers,
    )
    assert listed.status_code == 200, listed.text
    items = listed.json()["items"]
    assert len(items) >= 2
    dates = {item["date"] for item in items}
    assert yesterday.isoformat() in dates
    assert today.isoformat() in dates
    scores = {item["date"]: item["symptom_burden_score"] for item in items}
    assert scores[yesterday.isoformat()] == 1
    assert scores[today.isoformat()] == 1


def test_symptom_burden_score_caps_inhaler_points(client: TestClient, auth_headers: dict):
    check_in = client.post(
        "/v1/check-ins",
        json={
            "daily_day_symp": True,
            "daily_night_symp": True,
            "daily_limit_activity": True,
        },
        headers=auth_headers,
    )
    assert check_in.status_code == 201

    inhaler = client.put(
        "/v1/check-ins/inhaler",
        json={"puffs_today": 10},
        headers=auth_headers,
    )
    assert inhaler.status_code == 200

    today = client.get("/v1/check-ins/today", headers=auth_headers)
    assert today.status_code == 200
    assert today.json()["symptom_burden_score"] == 5


@patch("services.forecast_service.generate_advice")
@patch("services.forecast_service.fetch_env_daily")
def test_updating_today_check_in_refreshes_existing_forecast(
    mock_fetch_env,
    mock_generate_advice,
    client: TestClient,
    auth_headers: dict,
    mock_env_fetch,
    mock_advice,
):
    mock_fetch_env.side_effect = mock_env_fetch.side_effect
    mock_generate_advice.side_effect = mock_advice.side_effect

    assert (
        client.post(
            "/v1/check-ins",
            json={
                "daily_day_symp": False,
                "daily_night_symp": False,
                "daily_limit_activity": False,
            },
            headers=auth_headers,
        ).status_code
        == 201
    )
    first = client.post(
        "/v1/forecast",
        json={"lat": 42.36, "lon": -71.06},
        headers=auth_headers,
    )
    assert first.status_code == 200, first.text
    advice_calls_after_forecast = mock_generate_advice.call_count

    updated = client.post(
        "/v1/check-ins",
        json={
            "daily_day_symp": True,
            "daily_night_symp": True,
            "daily_limit_activity": True,
        },
        headers=auth_headers,
    )
    assert updated.status_code == 201, updated.text
    body = updated.json()
    assert body["forecast_refreshed"] is True
    assert body["forecast"]["risk_level"]
    assert any(f.startswith("Daytime symptoms on ") for f in body["forecast"]["contributing_factors"])
    assert any(f.startswith("Night symptoms on ") for f in body["forecast"]["contributing_factors"])
    # Check-in refresh re-runs ML only — advice is backfilled later on Home.
    assert mock_generate_advice.call_count == advice_calls_after_forecast

    stored = client.get("/v1/forecasts/today", headers=auth_headers)
    assert stored.status_code == 200
    tomorrow = stored.json().get("tomorrow")
    assert tomorrow is not None
    assert any(f.startswith("Night symptoms on ") for f in (tomorrow.get("contributing_factors") or []))
    assert tomorrow.get("advice") is None


@patch("services.forecast_service.generate_advice")
@patch("services.forecast_service.fetch_env_daily")
def test_updating_yesterday_check_in_refreshes_today_card(
    mock_fetch_env,
    mock_generate_advice,
    client: TestClient,
    auth_headers: dict,
    mock_env_fetch,
    mock_advice,
):
    mock_fetch_env.side_effect = mock_env_fetch.side_effect
    mock_generate_advice.side_effect = mock_advice.side_effect

    yesterday = (date.today() - timedelta(days=1)).isoformat()
    assert (
        client.post(
            "/v1/check-ins",
            json={"date": yesterday, "daily_night_symp": False},
            headers=auth_headers,
        ).status_code
        == 201
    )
    create = client.post(
        "/v1/forecast",
        json={"lat": 42.36, "lon": -71.06, "date": yesterday},
        headers=auth_headers,
    )
    assert create.status_code == 200, create.text

    updated = client.post(
        "/v1/check-ins",
        json={
            "date": yesterday,
            "daily_day_symp": True,
            "daily_night_symp": True,
            "daily_limit_activity": False,
        },
        headers=auth_headers,
    )
    assert updated.status_code == 201, updated.text
    assert updated.json()["forecast_refreshed"] is True
    assert any(f.startswith("Night symptoms on ") for f in updated.json()["forecast"]["contributing_factors"])

    cards = client.get("/v1/forecasts/today", headers=auth_headers)
    assert cards.status_code == 200
    today_card = cards.json().get("today")
    assert today_card is not None
    assert any(f.startswith("Night symptoms on ") for f in (today_card.get("contributing_factors") or []))


@patch("services.forecast_service.generate_advice")
@patch("services.forecast_service.fetch_env_daily")
def test_check_in_without_forecast_does_not_create_one(
    mock_fetch_env,
    mock_generate_advice,
    client: TestClient,
    auth_headers: dict,
    mock_env_fetch,
    mock_advice,
):
    mock_fetch_env.side_effect = mock_env_fetch.side_effect
    mock_generate_advice.side_effect = mock_advice.side_effect

    response = client.post(
        "/v1/check-ins",
        json={"daily_night_symp": True},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["forecast_refreshed"] is False
    assert "forecast" not in response.json()
    assert mock_generate_advice.call_count == 0

