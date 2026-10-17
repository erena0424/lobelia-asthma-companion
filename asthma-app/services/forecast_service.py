"""Forecast assembly — env + DB + classifier + advice."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from copilot.state import AdviceType
from model.inference import predict_classifier
from db.models import CheckIn, EnvSnapshot, Forecast, User, WearableDaily
from services.advice_service import generate_advice
from services.check_in_service import (
    check_in_complete,
    check_in_context,
    compute_is_flare_up_from_check_in,
    describe_check_in,
)
from services.env_fetcher import fetch_env_daily

CHECK_IN_UNAVAILABLE_WARNING = (
    "Generated without today's symptom check-in; advice is based on the "
    "cached forecast, environment, and medical knowledge."
)


def _symptoms_summary(check_in: CheckIn | None) -> str | None:
    """Return a symptom summary, or None when no check-in was logged."""
    if check_in is None:
        return None
    parts = []
    if check_in.daily_day_symp:
        parts.append("daytime symptoms")
    if check_in.daily_night_symp:
        parts.append("night symptoms")
    if check_in.daily_limit_activity:
        parts.append("activity limitation")
    detail = describe_check_in(check_in_context(check_in))
    if not parts:
        # Explicit check-in with no symptoms selected — not the same as "missing."
        summary = "no significant symptoms reported"
    else:
        summary = ", ".join(parts)
    # the user's own detail (mood, 0-10 scores, triggers they noted) for the AI advice only
    if detail and detail != "no symptoms reported":
        summary += f" (user-reported detail: {detail})"
    return summary


def _day_label(day: date) -> str:
    """'Fri, Oct 16': the check-in day a factor came from, never 'today'."""
    return f"{day:%a}, {day:%b} {day.day}"


def _dated_factors(factors: list[str] | None, anchor_date: date) -> list[str]:
    """Reword legacy stored factors ('Night symptoms today') with the check-in day.

    Forecasts are built from the previous day's check-in, so 'today' was wrong
    by the time the card showing today was read.
    """
    day = _day_label(anchor_date)
    out = []
    for factor in factors or []:
        if factor.endswith(" today"):
            factor = f"{factor[: -len(' today')]} on {day}"
        elif factor.startswith("Rescue inhaler used") and " on " not in factor:
            factor = f"{factor} on {day}"
        out.append(factor)
    return out


def _humanize_top_features(
    top_features: list[str],
    env: dict,
    check_in: CheckIn | None,
) -> list[str]:
    factors: list[str] = []
    pollen_map = {
        "tree_pollen": "tree pollen",
        "grass_pollen": "grass pollen",
        "weed_pollen": "weed pollen",
    }
    for key, label in pollen_map.items():
        level = env.get(key)
        if level in ("High", "Very High"):
            factors.append(f"High {label}")

    if check_in is not None:
        day = _day_label(check_in.date)
        if check_in.daily_night_symp:
            factors.append(f"Night symptoms on {day}")
        if check_in.daily_day_symp:
            factors.append(f"Daytime symptoms on {day}")
        if check_in.puffs_today == 1:
            factors.append(f"Rescue inhaler used once on {day}")
        elif check_in.puffs_today >= 2:
            factors.append(f"Rescue inhaler used {check_in.puffs_today} times on {day}")

    if env.get("humidity") and env["humidity"] >= 80:
        factors.append("High humidity")
    if env.get("aqi") and env["aqi"] >= 3:
        factors.append("Elevated air quality index")

    if not factors and top_features:
        factors.extend(top_features[:3])
    return factors[:5]


def _data_quality(
    *,
    unavailable_context: list[str] | None = None,
    missing_fields: list[str] | None = None,
    imputed_fields: list[str] | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "unavailable_context": list(unavailable_context or []),
        "missing_fields": list(missing_fields or []),
        "imputed_fields": list(imputed_fields or []),
        "warnings": list(warnings or []),
    }


def _unpack_advice_result(advice_result) -> tuple[dict | None, list[str], dict | None]:
    """Accept (advice, warnings) or (advice, warnings, debug) from generate_advice / mocks."""
    if isinstance(advice_result, tuple):
        advice = advice_result[0] if len(advice_result) > 0 else None
        warnings = list(advice_result[1]) if len(advice_result) > 1 else []
        debug = advice_result[2] if len(advice_result) > 2 else None
        return advice, warnings, debug
    return advice_result, [], None


def forecast_has_advice(advice: Any) -> bool:
    """True when stored advice has a usable summary or at least one section."""
    if not isinstance(advice, dict):
        return False
    if str(advice.get("summary") or "").strip():
        return True
    sections = advice.get("sections") or []
    return isinstance(sections, list) and any(
        isinstance(section, dict) and str(section.get("body") or "").strip()
        for section in sections
    )


def free_text_as_manual_events(text: str | None, day: date) -> list[dict]:
    """Turn the check-in Calendar event field into a structured manual event."""
    title = (text or "").strip()
    if not title:
        return []
    return [
        {
            "title": title,
            "start": day.isoformat(),
            "all_day": True,
            "source": "manual",
        }
    ]


def _manual_calendar_stale(forecast: dict, target_check_in: CheckIn | None) -> bool:
    """True when stored advice still has a manual event that doesn't match this day."""
    stored = forecast.get("calendar_events") or []
    stored_manual = [
        event
        for event in stored
        if isinstance(event, dict)
        and str(event.get("source") or "") in {"manual", "manual_override"}
    ]
    text = (target_check_in.calendar_event or "").strip() if target_check_in is not None else ""
    if text:
        return not any(str(event.get("title") or "").strip() == text for event in stored)
    return bool(stored_manual)


async def resolve_calendar_for_advice(
    db: Session,
    user: User,
    *,
    anchor_check_in: CheckIn | None,
    forecast_for: date,
    calendar_events_override: list[dict] | None = None,
    timezone_name: str = "America/Chicago",
) -> tuple[list[dict], str | None]:
    """Resolve calendar context for Copilot advice.

    The check-in Calendar event field belongs to that calendar day. Today's
    Home card must not reuse yesterday's ice skating as a plan for today.

    Priority:
    1. Request override
    2. Free-text on the check-in for ``forecast_for`` (user edit wins over Google)
    3. Google Calendar for ``forecast_for``
    4. Structured events stored on the forecast-day check-in, else the anchor
       (``/manual-events`` / cached Google)
    """
    from services import google_calendar as gcal

    if calendar_events_override is not None:
        events = [dict(event) for event in calendar_events_override]
        for event in events:
            event.setdefault("source", "request")
        return events, gcal.events_to_summary(events)

    target_check_in = db.scalar(
        select(CheckIn).where(CheckIn.user_id == user.id, CheckIn.date == forecast_for)
    )
    free_text = (
        (target_check_in.calendar_event or "").strip() if target_check_in is not None else ""
    )
    if free_text:
        return free_text_as_manual_events(free_text, forecast_for), free_text

    events: list[dict] = []
    if user.google_calendar_refresh_token:
        try:
            events = await gcal.fetch_events_for_day(
                user.google_calendar_refresh_token,
                day=forecast_for,
                timezone_name=timezone_name,
            )
            for event in events:
                event.setdefault("source", "google_calendar")
        except Exception:
            cached = (target_check_in or anchor_check_in)
            events = list((cached.calendar_events if cached is not None else None) or [])
            for event in events:
                if isinstance(event, dict):
                    event.setdefault("source", "check_in_fallback")
    else:
        structured_from = None
        if target_check_in is not None and target_check_in.calendar_events:
            structured_from = target_check_in
        elif anchor_check_in is not None and anchor_check_in.calendar_events:
            structured_from = anchor_check_in
        if structured_from is not None:
            events = [dict(event) for event in structured_from.calendar_events]
            for event in events:
                event.setdefault("source", "check_in")

    if events:
        return events, gcal.events_to_summary(events)

    return [], None


async def ensure_forecast_advice(
    db: Session,
    user: User,
    forecast: dict | None,
    *,
    llm_provider: str | None = None,
    advice_type: AdviceType = "daily",
) -> dict | None:
    """If a stored forecast is missing advice, regenerate and merge it."""
    if forecast is None:
        return forecast

    anchor_date = date.fromisoformat(forecast["date"])
    forecast_for = (
        date.fromisoformat(forecast["forecast_for"])
        if forecast.get("forecast_for")
        else anchor_date + timedelta(days=1)
    )
    target_check_in = db.scalar(
        select(CheckIn).where(CheckIn.user_id == user.id, CheckIn.date == forecast_for)
    )
    calendar_stale = _manual_calendar_stale(forecast, target_check_in)
    if forecast_has_advice(forecast.get("advice")) and not calendar_stale:
        return forecast

    try:
        regenerated = await regenerate_advice(
            db,
            user,
            anchor_date=anchor_date,
            llm_provider=llm_provider,
            advice_type=advice_type,
        )
    except Exception:
        return forecast

    if not forecast_has_advice(regenerated.get("advice")):
        return forecast

    return {
        **forecast,
        "advice": regenerated["advice"],
        "warnings": regenerated.get("warnings", forecast.get("warnings", [])),
        "data_quality": regenerated.get("data_quality", forecast.get("data_quality")),
        "contributing_factors": regenerated.get(
            "contributing_factors", forecast.get("contributing_factors")
        ),
        "calendar_events": regenerated.get(
            "calendar_events", forecast.get("calendar_events")
        ),
    }


async def _try_run_forecast(
    db: Session,
    user: User,
    *,
    lat: float,
    lon: float,
    anchor_date: date,
    llm_provider: str | None = None,
    advice_type: AdviceType = "daily",
    timezone_name: str = "America/Chicago",
) -> dict | None:
    """Run forecast for an anchor day; return None if check-in/other soft failure."""
    from api.errors import APIError

    try:
        return await run_forecast(
            db,
            user,
            lat=lat,
            lon=lon,
            anchor_date=anchor_date,
            llm_provider=llm_provider,
            advice_type=advice_type,
            timezone_name=timezone_name,
        )
    except APIError as exc:
        if exc.code in {
            "CHECK_IN_REQUIRED",
            "CLASSIFIER_UNAVAILABLE",
            "FORECAST_NOT_FOUND",
            "ENV_PROVIDER_ERROR",
        }:
            return None
        raise
    except Exception:
        return None


async def ensure_card_predictions(
    db: Session,
    user: User,
    *,
    lat: float,
    lon: float,
    today: date | None = None,
    llm_provider: str | None = None,
    advice_type: AdviceType = "daily",
    timezone_name: str = "America/Chicago",
) -> dict:
    """Get-or-create Home/Statistics card predictions.

    - ``today``: prediction targeting calendar today (usually from yesterday's check-in)
    - ``tomorrow``: prediction targeting tomorrow (from today's check-in)

    Returns stored rows when present; otherwise runs ML+advice. Also backfills
    advice when a stored forecast has ``advice: null``.

    Tomorrow is only *generated* after 18:00 local (matching the UI unlock rule).
    """
    from api.errors import api_error
    from datetime import datetime
    from zoneinfo import ZoneInfo

    today = today or date.today()
    yesterday = today - timedelta(days=1)
    tomorrow = today + timedelta(days=1)

    try:
        local_now = datetime.now(ZoneInfo(timezone_name))
    except Exception:
        local_now = datetime.now().astimezone()
    after_six = local_now.hour >= 18

    for_today = get_forecast(db, user.id, targeting=today)
    for_tomorrow = get_forecast(db, user.id, targeting=tomorrow)

    if for_today is None:
        for_today = await _try_run_forecast(
            db,
            user,
            lat=lat,
            lon=lon,
            anchor_date=yesterday,
            llm_provider=llm_provider,
            advice_type=advice_type,
            timezone_name=timezone_name,
        )
    else:
        for_today = await ensure_forecast_advice(
            db,
            user,
            for_today,
            llm_provider=llm_provider,
            advice_type=advice_type,
        )

    if for_tomorrow is None:
        if after_six:
            for_tomorrow = await _try_run_forecast(
                db,
                user,
                lat=lat,
                lon=lon,
                anchor_date=today,
                llm_provider=llm_provider,
                advice_type=advice_type,
                timezone_name=timezone_name,
            )
    else:
        for_tomorrow = await ensure_forecast_advice(
            db,
            user,
            for_tomorrow,
            llm_provider=llm_provider,
            advice_type=advice_type,
        )

    if for_today is None and for_tomorrow is None:
        raise api_error(
            404,
            "No prediction available yet. Complete a symptom check-in to generate a forecast.",
            "FORECAST_NOT_FOUND",
        )

    return {"today": for_today, "tomorrow": for_tomorrow}


def _delete_forecasts_for_anchor(db: Session, user_id, anchor_date: date) -> None:
    rows = db.scalars(
        select(Forecast).where(Forecast.user_id == user_id, Forecast.date == anchor_date)
    ).all()
    for row in rows:
        db.delete(row)
    db.flush()


def _coords_for_refresh(
    db: Session, user_id, day: date
) -> tuple[float | None, float | None, EnvSnapshot | None]:
    """Prefer the day's env snapshot; else the user's most recent snapshot."""
    snapshot = db.scalar(
        select(EnvSnapshot).where(EnvSnapshot.user_id == user_id, EnvSnapshot.date == day)
    )
    if snapshot is not None:
        return snapshot.lat, snapshot.lon, snapshot
    latest = db.scalar(
        select(EnvSnapshot)
        .where(EnvSnapshot.user_id == user_id)
        .order_by(EnvSnapshot.date.desc())
    )
    if latest is not None:
        return latest.lat, latest.lon, None
    return None, None, None


async def refresh_forecast_after_check_in(
    db: Session,
    user: User,
    *,
    day: date,
    today: date | None = None,
    calendar_changed: bool = False,
) -> dict | None:
    """Re-run ML for today/yesterday when a forecast already exists for that check-in day.

    Skips LLM advice so check-in saves stay fast; Home/``POST /v1/forecasts/today``
    backfills advice when ``advice`` is null. Does not create a first-time forecast
    (preserves the 6pm tomorrow unlock rule).

    When ``calendar_changed`` is true, also clear advice on the card targeting
    ``day`` so Home picks up the check-in Calendar event field.
    """
    today = today or date.today()
    if calendar_changed:
        _clear_advice_for_target_day(db, user.id, day)

    if day not in {today, today - timedelta(days=1)}:
        return None
    if get_forecast(db, user.id, run_on=day) is None:
        return None
    if not check_in_complete(
        db.scalar(select(CheckIn).where(CheckIn.user_id == user.id, CheckIn.date == day))
    ):
        return None

    lat, lon, _snapshot = _coords_for_refresh(db, user.id, day)
    if lat is None or lon is None:
        return None

    try:
        return await run_forecast(
            db,
            user,
            lat=lat,
            lon=lon,
            anchor_date=day,
            force_refresh=True,
            skip_advice=True,
            reuse_stored_env=True,
        )
    except Exception:
        return None


def _clear_advice_for_target_day(db: Session, user_id, day: date) -> None:
    """Drop stored advice for the prediction targeting ``day`` so it regenerates."""
    row = db.scalar(
        select(Forecast)
        .where(Forecast.user_id == user_id, Forecast.forecast_for == day)
        .order_by(Forecast.created_at.desc())
    )
    if row is None:
        return
    row.advice = None
    db.commit()


async def run_forecast(
    db: Session,
    user: User,
    *,
    lat: float,
    lon: float,
    anchor_date: date | None = None,
    llm_provider: str | None = None,
    advice_type: AdviceType = "daily",
    calendar_events: list[dict] | None = None,
    timezone_name: str = "America/Chicago",
    force_refresh: bool = False,
    skip_advice: bool = False,
    reuse_stored_env: bool = False,
) -> dict:
    anchor_date = anchor_date or date.today()
    forecast_for = anchor_date + timedelta(days=1)

    # Reuse a stored prediction for this check-in day (do not re-run ML).
    # If advice was missing (LLM outage on first run), fill it in now.
    existing = get_forecast(db, user.id, run_on=anchor_date)
    if existing is not None and not force_refresh:
        return await ensure_forecast_advice(
            db,
            user,
            existing,
            llm_provider=llm_provider,
            advice_type=advice_type,
        ) or existing

    if existing is not None and force_refresh:
        _delete_forecasts_for_anchor(db, user.id, anchor_date)

    check_in = db.scalar(
        select(CheckIn).where(CheckIn.user_id == user.id, CheckIn.date == anchor_date)
    )
    if not check_in_complete(check_in):
        from api.errors import api_error

        raise api_error(
            400,
            "Log today's symptoms or at least one rescue inhaler puff before generating a forecast.",
            "CHECK_IN_REQUIRED",
        )

    # Calendar for the prediction target day — not the check-in day that powered ML.
    resolved_events, calendar_summary = await resolve_calendar_for_advice(
        db,
        user,
        anchor_check_in=check_in,
        forecast_for=forecast_for,
        calendar_events_override=calendar_events,
        timezone_name=timezone_name,
    )

    yesterday = anchor_date - timedelta(days=1)
    wearable = db.scalar(
        select(WearableDaily).where(WearableDaily.user_id == user.id, WearableDaily.date == yesterday)
    )

    snapshot = db.scalar(
        select(EnvSnapshot).where(EnvSnapshot.user_id == user.id, EnvSnapshot.date == anchor_date)
    )
    env_result: dict[str, Any]
    used_cached_env = (
        reuse_stored_env
        and snapshot is not None
        and isinstance(snapshot.features, dict)
    )
    if used_cached_env:
        env_features = dict(snapshot.features)
        env_result = {
            "provider": snapshot.provider or "cached",
            "features": env_features,
            "missing": snapshot.missing or [],
        }
    else:
        try:
            env_result = await fetch_env_daily(lat=lat, lon=lon, day=anchor_date)
        except Exception as exc:
            from api.errors import api_error

            # Avoid leaking upstream URLs / API keys in client-facing error messages.
            raise api_error(
                502,
                "Environment provider error. Please try again later.",
                "ENV_PROVIDER_ERROR",
            ) from exc

        env_features = env_result["features"]
        if snapshot is None:
            snapshot = EnvSnapshot(
                user_id=user.id,
                date=anchor_date,
                lat=lat,
                lon=lon,
                provider=env_result["provider"],
                features=env_features,
                missing=env_result.get("missing"),
            )
            db.add(snapshot)
        else:
            snapshot.lat = lat
            snapshot.lon = lon
            snapshot.provider = env_result["provider"]
            snapshot.features = env_features
            snapshot.missing = env_result.get("missing")

    # Tomorrow env for temp_diff when available
    temp_diff = None
    if not used_cached_env:
        try:
            tomorrow_env = await fetch_env_daily(lat=lat, lon=lon, day=forecast_for)
            t_today = env_features.get("temperature")
            t_tomorrow = tomorrow_env["features"].get("temperature")
            if t_today is not None and t_tomorrow is not None:
                temp_diff = float(t_tomorrow) - float(t_today)
        except Exception:
            pass

    classifier_payload = {
        **env_features,
        "sleep_minutes_lag": float(wearable.sleep_minutes) if wearable and wearable.sleep_minutes is not None else None,
        "sedentary_minutes_lag": float(wearable.sedentary_minutes)
        if wearable and wearable.sedentary_minutes is not None
        else None,
        "running_minutes_lag": float(wearable.running_minutes)
        if wearable and wearable.running_minutes is not None
        else None,
        "total_steps_lag": float(wearable.total_steps) if wearable and wearable.total_steps is not None else None,
        "avg_hr_lag": float(wearable.avg_hr) if wearable and wearable.avg_hr is not None else None,
        "temp_diff_tomorrow": temp_diff,
        "is_flare_up": compute_is_flare_up_from_check_in(check_in),
    }

    try:
        prediction = predict_classifier(classifier_payload)
    except FileNotFoundError as exc:
        from api.errors import api_error

        raise api_error(503, str(exc), "CLASSIFIER_UNAVAILABLE") from exc

    contributing_factors = _humanize_top_features(
        prediction.get("top_features", []),
        env_features,
        check_in,
    )

    forecast_context = {
        "risk_level": prediction["risk_level"],
        "flare_probability": prediction.get("flare_probability"),
        "predicted_flare_tomorrow": prediction.get("predicted_flare_tomorrow"),
        "contributing_factors": contributing_factors,
        "top_features": prediction.get("top_features", []),
    }
    advice_warnings: list[str] = []
    advice_debug: dict | None = None
    advice = None
    if not skip_advice:
        try:
            import asyncio
            import os

            advice_timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "45")) * 3
            advice_result = await asyncio.wait_for(
                generate_advice(
                    risk_level=prediction["risk_level"],
                    contributing_factors=contributing_factors,
                    calendar_event=calendar_summary,
                    calendar_events=resolved_events,
                    symptoms_summary=_symptoms_summary(check_in) or "no significant symptoms reported",
                    puffs_today=check_in.puffs_today,
                    layer3_summary="",
                    llm_provider=llm_provider,
                    advice_type=advice_type,
                    db=db,
                    user=user,
                    anchor_date=anchor_date,
                    forecast=forecast_context,
                    environment=env_features,
                    return_warnings=True,
                ),
                timeout=advice_timeout,
            )
            advice, advice_warnings, advice_debug = _unpack_advice_result(advice_result)
        except Exception:
            advice = None
            advice_warnings.append(
                "Advice is temporarily unavailable; the ML forecast is still valid."
            )
    else:
        advice_warnings.append(
            "Advice will refresh on the next Home load after this symptom update."
        )

    record = Forecast(
        user_id=user.id,
        date=anchor_date,
        forecast_for=forecast_for,
        flare_probability=prediction.get("flare_probability"),
        risk_level=prediction.get("risk_level"),
        contributing_factors=contributing_factors,
        advice=advice,
        calendar_events=resolved_events or None,
    )
    db.add(record)
    db.commit()

    # Episode memory after the forecast is saved so embedding never blocks the response path.
    from services.episode_store import soft_upsert_episode_for_forecast

    soft_upsert_episode_for_forecast(
        db,
        user.id,
        anchor_date,
        environment=env_features,
    )
    try:
        db.commit()
    except Exception:
        db.rollback()

    unavailable: list[str] = []
    if wearable is None:
        unavailable.append("wearables")
    if not resolved_events and not (calendar_summary or "").strip():
        unavailable.append("calendar")

    if calendar_events is not None:
        calendar_source = "request"
    elif resolved_events:
        calendar_source = str(resolved_events[0].get("source") or "check_in")
    else:
        calendar_source = "none"


    quality_warnings = list(advice_warnings)
    if "wearables" in unavailable:
        quality_warnings.append("Forecast used no wearable lag features for yesterday.")
    if "calendar" in unavailable:
        quality_warnings.append("No calendar event was provided for today.")

    payload = {
        "date": anchor_date.isoformat(),
        "forecast_for": forecast_for.isoformat(),
        "prediction_mode": prediction.get("prediction_mode", "classifier"),
        "flare_probability": prediction.get("flare_probability"),
        "predicted_flare_tomorrow": prediction.get("predicted_flare_tomorrow"),
        "risk_level": prediction.get("risk_level"),
        "contributing_factors": contributing_factors,
        "top_features": prediction.get("top_features", []),
        "cold_start": prediction.get("cold_start", False),
        "missing_features": prediction.get("missing_features", []),
        "warnings": [*prediction.get("warnings", []), *advice_warnings],
        "calendar_events": resolved_events,
        "calendar_source": calendar_source,
        "advice": advice,
        "data_quality": _data_quality(
            unavailable_context=unavailable,
            missing_fields=env_result.get("missing") or prediction.get("missing_features") or [],
            warnings=quality_warnings,
        ),
    }
    if advice_debug is not None:
        payload["debug"] = advice_debug
    return payload


async def regenerate_advice(
    db: Session,
    user: User,
    *,
    anchor_date: date | None = None,
    llm_provider: str | None = None,
    advice_type: AdviceType = "daily",
) -> dict:
    """Re-run advice using a cached forecast and persist it on the forecast row."""
    return await _advice_from_cached_forecast(
        db,
        user,
        anchor_date=anchor_date,
        llm_provider=llm_provider,
        advice_type=advice_type,
        question=None,
        persist=True,
    )


async def generate_chat_reply(
    db: Session,
    user: User,
    *,
    message: str,
    anchor_date: date | None = None,
    llm_provider: str | None = None,
    advice_type: AdviceType = "daily",
) -> dict:
    """Answer a chat message via Copilot without overwriting Home-card advice."""
    from api.errors import api_error

    cleaned = (message or "").strip()
    if not cleaned:
        raise api_error(400, "message is required.", "VALIDATION_ERROR")

    return await _advice_from_cached_forecast(
        db,
        user,
        anchor_date=anchor_date,
        llm_provider=llm_provider,
        advice_type=advice_type,
        question=cleaned,
        persist=False,
    )


async def _advice_from_cached_forecast(
    db: Session,
    user: User,
    *,
    anchor_date: date | None = None,
    llm_provider: str | None = None,
    advice_type: AdviceType = "daily",
    question: str | None = None,
    persist: bool = True,
) -> dict:
    """Shared path for daily advice regen and chat Q&A over a cached forecast."""
    from api.errors import api_error
    import asyncio
    import os

    day = anchor_date or date.today()
    # Match Home: prefer a forecast run today; else the prediction targeting today
    # (usually from yesterday's check-in).
    forecast = db.scalar(
        select(Forecast)
        .where(Forecast.user_id == user.id, Forecast.date == day)
        .order_by(Forecast.created_at.desc())
    )
    if forecast is None:
        forecast = db.scalar(
            select(Forecast)
            .where(Forecast.user_id == user.id, Forecast.forecast_for == day)
            .order_by(Forecast.created_at.desc())
        )
    if forecast is None:
        raise api_error(
            404,
            "No forecast found for this date. Complete a check-in and generate a prediction first.",
            "FORECAST_NOT_FOUND",
        )

    # Check-in / env belong to the day the forecast was run, not necessarily "today".
    context_date = forecast.date

    check_in = db.scalar(
        select(CheckIn).where(CheckIn.user_id == user.id, CheckIn.date == context_date)
    )

    contributing_factors = _dated_factors(forecast.contributing_factors, forecast.date)
    snapshot = db.scalar(
        select(EnvSnapshot).where(
            EnvSnapshot.user_id == user.id,
            EnvSnapshot.date == context_date,
        )
    )
    env_features = snapshot.features if snapshot else {}

    # Prefer factors already stored on the forecast; enrich with current env when present.
    if env_features:
        env_only = _humanize_top_features([], env_features, None)
        for factor in env_only:
            if factor not in contributing_factors:
                contributing_factors.append(factor)
        contributing_factors = contributing_factors[:5]

    forecast_context = {
        "risk_level": forecast.risk_level or "Medium",
        "flare_probability": forecast.flare_probability,
        "contributing_factors": contributing_factors,
    }

    unavailable: list[str] = []
    advice_warnings: list[str] = []
    if check_in is None:
        unavailable.append("check_in")
        advice_warnings.append(CHECK_IN_UNAVAILABLE_WARNING)
    if not snapshot:
        unavailable.append("environment")
        advice_warnings.append(
            "No stored environment snapshot for this date; advice may be less specific."
        )
    symptoms = _symptoms_summary(check_in)
    # Prompt still needs a string; mark unknown explicitly so the LLM does not
    # treat missing check-in as "no symptoms."
    symptoms_for_prompt = (
        symptoms
        if symptoms is not None
        else "not logged today (unknown — do not assume the patient is symptom-free)"
    )
    puffs_today = check_in.puffs_today if check_in is not None else 0

    resolved_events, calendar_summary = await resolve_calendar_for_advice(
        db,
        user,
        anchor_check_in=check_in,
        forecast_for=forecast.forecast_for,
    )
    if not resolved_events and not (calendar_summary or "").strip():
        unavailable.append("calendar")

    try:
        advice_timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "45")) * 3
        advice_result = await asyncio.wait_for(
            generate_advice(
                risk_level=forecast.risk_level or "Medium",
                contributing_factors=contributing_factors,
                calendar_event=calendar_summary,
                calendar_events=resolved_events,
                symptoms_summary=symptoms_for_prompt,
                puffs_today=puffs_today,
                layer3_summary="",
                llm_provider=llm_provider,
                advice_type=advice_type,
                db=db,
                user=user,
                anchor_date=context_date,
                forecast=forecast_context,
                environment=env_features,
                question=question,
                return_warnings=True,
            ),
            timeout=advice_timeout,
        )
        advice, provider_warnings, advice_debug = _unpack_advice_result(advice_result)
        advice_warnings.extend(provider_warnings)
    except Exception:
        advice = None
        advice_debug = None
        advice_warnings.append(
            "Advice is temporarily unavailable; the stored ML forecast is still valid."
        )

    if persist:
        if advice is not None:
            forecast.advice = advice
        forecast.calendar_events = resolved_events
        db.commit()
        db.refresh(forecast)

    payload = {
        "date": forecast.date.isoformat(),
        "forecast_for": forecast.forecast_for.isoformat(),
        "risk_level": forecast.risk_level,
        "flare_probability": forecast.flare_probability,
        "contributing_factors": contributing_factors,
        "calendar_events": resolved_events,
        "advice": advice,
        "warnings": advice_warnings,
        "data_quality": _data_quality(
            unavailable_context=unavailable,
            missing_fields=list(snapshot.missing or []) if snapshot else [],
            warnings=advice_warnings,
        ),
    }
    if advice_debug is not None:
        payload["debug"] = advice_debug
    return payload


def forecast_to_dict(record: Forecast) -> dict:
    return {
        "date": record.date.isoformat(),
        "forecast_for": record.forecast_for.isoformat(),
        "flare_probability": record.flare_probability,
        "predicted_flare_tomorrow": bool(record.flare_probability and record.flare_probability >= 0.5),
        "risk_level": record.risk_level,
        "contributing_factors": _dated_factors(record.contributing_factors, record.date),
        "calendar_events": record.calendar_events or [],
        "advice": record.advice,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


def list_forecasts(
    db: Session,
    user_id,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
) -> list[dict]:
    query = select(Forecast).where(Forecast.user_id == user_id).order_by(Forecast.date.desc())
    if from_date:
        query = query.where(Forecast.date >= from_date)
    if to_date:
        query = query.where(Forecast.date <= to_date)
    rows = db.scalars(query).all()
    seen: set[date] = set()
    items: list[dict] = []
    for row in rows:
        if row.date in seen:
            continue
        seen.add(row.date)
        items.append(forecast_to_dict(row))
    return items


def get_forecast(
    db: Session,
    user_id,
    *,
    run_on: date | None = None,
    targeting: date | None = None,
) -> dict | None:
    """Fetch a cached forecast by run day and/or target day.

    - ``run_on``: the check-in / POST day (``Forecast.date``)
    - ``targeting``: the day being predicted (``Forecast.forecast_for``)

    Provide at least one. If both are set, both filters apply.
    """
    if run_on is None and targeting is None:
        raise ValueError("Provide run_on and/or targeting")

    query = select(Forecast).where(Forecast.user_id == user_id)
    if run_on is not None:
        query = query.where(Forecast.date == run_on)
    if targeting is not None:
        query = query.where(Forecast.forecast_for == targeting)
    record = db.scalar(query.order_by(Forecast.created_at.desc()))
    return forecast_to_dict(record) if record else None


def get_current_prediction(db: Session, user_id, *, today: date | None = None) -> dict | None:
    """Best prediction to show on Home / Statistics for ``today``.

    Prefer a forecast already run today (predicts tomorrow). Otherwise fall
    back to the prediction *for* today (usually from yesterday's check-in).
    """
    today = today or date.today()
    from_today = get_forecast(db, user_id, run_on=today)
    if from_today is not None:
        return from_today
    return get_forecast(db, user_id, targeting=today)
