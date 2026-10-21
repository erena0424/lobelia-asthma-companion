"""Quick log roll-up rules: pure functions over log dicts (standard library only).

Turns one day's quick logs into suggested Day check-in answers, and into the
Today card's view of a day that has no confirmed Day check-in yet. Code decides
every suggestion; the person confirms before anything is saved. Missing logs
mean "unknown", never "no symptoms". Rules: plan doc "Two check-ins: plan"
(Elena approved 2026-10-21).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

# The four symptoms, shared with the Day check-in (check_in_service imports these).
BREATHING_LABELS = {
    "shortness_of_breath": "shortness of breath",
    "chest_tightness": "chest tightness",
    "wheezing": "wheezing",
    "coughing": "coughing",
}
BREATHING_KEYS = tuple(BREATHING_LABELS)
# A log with a symptom between midnight and 6 am local time suggests "woke at night".
NIGHT_END_HOUR = 6


def _has_symptom(entry: dict) -> bool:
    return any(score >= 1 for score in (entry.get("breathing") or {}).values())


def _local_hour(entry: dict, tz_offset_minutes: int) -> int:
    """Hour of day where the person is. ``tz_offset_minutes`` uses JS getTimezoneOffset (UTC minus local)."""
    moment = datetime.fromisoformat(entry["logged_at"])
    return (moment.astimezone(timezone.utc) - timedelta(minutes=tz_offset_minutes)).hour


def prefill_from_logs(logs: Iterable[dict], puffs_today: int, tz_offset_minutes: int = 0) -> dict[str, Any]:
    """Suggested Day check-in answers from one day's quick logs, with the log each came from.

    Each answer is a value or None (= leave it for the person). ``*_from`` hold the
    ``logged_at`` of the log behind a suggestion, so the screen can say "From your 2:10 pm log".
    """
    logs = sorted(logs, key=lambda entry: entry["logged_at"])
    result: dict[str, Any] = {
        "log_count": len(logs),
        "logs": [{"logged_at": entry["logged_at"], "note": entry.get("note")} for entry in logs if entry.get("note")],
        "breathing": None,
        "breathing_from": {},
        "no_symptoms": None,
        "night_symptoms": None,
        "night_from": None,
        "activity_limited": None,
        "activity_from": None,
        "puffs": int(puffs_today or 0),
        "triggers": [],
    }
    if not logs:
        return result

    breathing = {key: 0 for key in BREATHING_KEYS}
    for entry in logs:
        for key in BREATHING_KEYS:
            score = int((entry.get("breathing") or {}).get(key) or 0)
            if score > breathing[key]:
                breathing[key] = score
                result["breathing_from"][key] = entry["logged_at"]
    result["breathing"] = breathing
    # every log said 0: offer "No symptoms today" (the person still confirms)
    result["no_symptoms"] = not any(breathing.values())

    night = next((entry for entry in logs if _has_symptom(entry) and _local_hour(entry, tz_offset_minutes) < NIGHT_END_HOUR), None)
    if night:
        result["night_symptoms"] = True
        result["night_from"] = night["logged_at"]

    limited = next((entry for entry in logs if entry.get("limiting_activity")), None)
    if limited:
        result["activity_limited"] = True
        result["activity_from"] = limited["logged_at"]

    seen: set[str] = set()
    for entry in logs:
        for trigger in entry.get("triggers") or []:
            if trigger.lower() not in seen:
                seen.add(trigger.lower())
                result["triggers"].append(trigger)
    return result


def context_from_logs(logs: list[dict], day: date, puffs_today: int) -> dict[str, Any]:
    """A day's quick logs in the same shape as ``check_in_context``, for the Today card.

    Used only for days without a confirmed Day check-in. Night waking is never inferred.
    """
    rolled = prefill_from_logs(logs, puffs_today)
    breathing = rolled["breathing"] or {}
    return {
        "date": day.isoformat(),
        "source": "quick_log",
        "mood": None,
        "breathing_0_to_10": {BREATHING_LABELS[key]: score for key, score in breathing.items() if score > 0},
        "night_waking": False,
        "activity_limitation": bool(rolled["activity_limited"]),
        "reliever_puffs": rolled["puffs"],
        "possible_triggers_noted": rolled["triggers"],
    }
