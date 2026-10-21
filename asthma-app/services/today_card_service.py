"""The Today card's fixed parts, decided in code (LBL-020).

Replaces the retired Low/Medium/High forecast on Today. Everything here is a
pure function over what the user logged, their saved action plan and today's
conditions. The LLM never picks a state, a zone or a step, and the action plan
never leaves this module except to the user's own screen.

Clinical rules: artifacts/eng/2026-10-18_zone-steps_clinical-advisor.md and
2026-10-17_weather-cutoffs_clinical-advisor.md (literature reads, not a
clinician's sign-off). Copy: artifacts/eng/2026-10-18_today-copy_regulatory-claims.md.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional

# Two calendar days in a row with symptoms -> point to the clinician (NHLBI: >24 h in the yellow zone).
ESCALATE_CONSECUTIVE_DAYS = 2
# "general": people without a saved plan see what an action plan usually covers. "none": no steps.
NO_PLAN_STEPS_MODE = "general"

NO_PLAN_STEPS = [
    "Use your reliever inhaler as your clinician prescribed.",
    "If you take a daily asthma medicine, keep taking it as prescribed.",
    "If your reliever isn't helping, or you need it more often than you were told, contact your clinician.",
]

PLAN_HEADINGS = {
    "green": "Your daily steps, from your action plan",
    "yellow": "Your plan's Yellow zone steps, as you saved them",
}
PLAN_NOTE = "From your saved action plan, shown as you entered it"
NO_PLAN_HEADING = "What an asthma action plan usually covers (not your plan)"
ESCALATION_LINE = "You've logged symptoms {days} days in a row. That's a good reason to contact your clinician."

# Breathing help moves to the top of the card on these signs (Elena, 2026-10-18 conflict check).
# Today never goes above Yellow; only Breathing help asks the questions that can lead to Red.
STRONG_SCORE = 7
HELP_TOP_LEADS = {
    (True, False): "Your check-in had a strong symptom.",
    (False, True): "Your check-in had limited activity.",
    (True, True): "Your check-in had a strong symptom and limited activity.",
}
HELP_TOP_FOLLOW = "Breathing help asks a few questions about how you're breathing now."

AQI_FLAG_BAND = 3  # "Unhealthy for sensitive groups" (US AQI 101+)
POLLEN_FLAG_LEVELS = ("High", "Very High")
COLD_FLAG_F = 32
TEMP_RANGE_FLAG_F = 18  # ~10 °C swing within the day


def _level(score: int) -> str:
    if score >= 7:
        return "Strong"
    if score >= 4:
        return "Noticeable"
    return "Slight"


def _day_label(day: date) -> str:
    return f"{day:%a}, {day:%b} {day.day}"


def symptom_signs(entry: dict[str, Any]) -> list[str]:
    """Plain labels for the yellow-zone signs in one day's check-in context.

    Reliever puffs count only alongside another sign: we don't know whether a
    lone puff was taken before exercise, which doesn't mean symptoms.
    """
    signs = [
        f"{_level(score).lower()} {str(name).replace('_', ' ')}"
        for name, score in sorted((entry.get("breathing_0_to_10") or {}).items(), key=lambda item: -item[1])
        if score >= 1
    ]
    if entry.get("night_waking"):
        signs.append("waking at night")
    if entry.get("activity_limitation"):
        signs.append("limited activity")
    if signs and entry.get("reliever_puffs"):
        puffs = int(entry["reliever_puffs"])
        signs.append(f"{puffs} reliever puff{'s' if puffs != 1 else ''}")
    return signs


def _join(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def symptom_state(check_ins: list[dict[str, Any]], today: date) -> dict[str, Any]:
    """none | green | yellow | escalate, from the latest check-in dated today or yesterday.

    An entry with ``source == "quick_log"`` stands for a day's quick logs (no Day check-in yet).

    ``check_ins`` are ``check_in_context`` entries (newest first is not assumed).
    Red is never produced here; it belongs to the Help flow.
    """
    by_day = {date.fromisoformat(entry["date"]): entry for entry in check_ins if entry and entry.get("date")}
    recent = [day for day in (today, today - timedelta(days=1)) if day in by_day]
    if not recent:
        return {"state": "none", "date": None, "signs": [], "lead": None, "dates": []}

    latest = recent[0]
    signs = symptom_signs(by_day[latest])
    window = sorted(day for day in by_day if today - timedelta(days=2) <= day <= today)

    if not signs:
        return {
            "state": "green",
            "date": latest.isoformat(),
            "signs": [],
            "lead": (
                f"Your quick logs on {_day_label(latest)} had no symptoms."
                if by_day[latest].get("source") == "quick_log"
                else f"You logged no symptoms on {_day_label(latest)}."
            ),
            "dates": [day.isoformat() for day in window],
        }

    streak = 0
    day = latest
    while day in by_day and symptom_signs(by_day[day]):
        streak += 1
        day -= timedelta(days=1)

    lead = f"You logged {_join(signs)} on {_day_label(latest)}."
    if by_day[latest].get("source") == "quick_log":
        lead = f"You logged {_join(signs)} in a quick log on {_day_label(latest)}."
    state = "escalate" if streak >= ESCALATE_CONSECUTIVE_DAYS else "yellow"
    result = {
        "state": state,
        "date": latest.isoformat(),
        "signs": signs,
        "lead": lead,
        "dates": [d.isoformat() for d in window],
    }
    if state == "escalate":
        result["escalation"] = ESCALATION_LINE.format(days=streak)
    return result


def _clean(value: Any) -> Optional[str]:
    text = str(value).strip() if value is not None else ""
    return text or None


def plan_steps(action_plan: Optional[dict[str, Any]], state: str) -> dict[str, Any]:
    """Steps from the user's own plan for the zone the state points to, word for word.

    Returns {"source": "plan"|"general"|None, "heading": str|None, "steps": [...], "open": bool}.
    """
    if state == "none":
        return {"source": None, "heading": None, "steps": [], "open": False}

    zone = "green" if state == "green" else "yellow"
    plan = action_plan if isinstance(action_plan, dict) else {}
    has_plan = any(isinstance(plan.get(key), dict) and any(_clean(v) for v in plan[key].values()) for key in ("green", "yellow", "red"))

    if not has_plan:
        if zone == "green" or NO_PLAN_STEPS_MODE != "general":
            return {"source": None, "heading": None, "steps": [], "open": False}
        return {"source": "general", "heading": NO_PLAN_HEADING, "steps": list(NO_PLAN_STEPS), "open": True}

    section = plan.get(zone) if isinstance(plan.get(zone), dict) else {}
    steps: list[str] = []
    if zone == "green":
        if _clean(section.get("daily_medicines")):
            steps.append(_clean(section["daily_medicines"]))
    else:
        medicine = " · ".join(filter(None, (_clean(section.get("quick_relief_medicine")), _clean(section.get("dose_device")))))
        repeat, max_doses = section.get("repeat_every_minutes"), section.get("max_doses")
        if medicine:
            if repeat and max_doses:
                medicine += f" · every {repeat} minutes, up to {max_doses} doses"
            elif repeat:
                medicine += f" · every {repeat} minutes"
            elif max_doses:
                medicine += f" · up to {max_doses} doses"
            steps.append(medicine)
        if _clean(section.get("if_not_improving")):
            steps.append(_clean(section["if_not_improving"]))

    return {"source": "plan", "heading": PLAN_HEADINGS[zone], "note": PLAN_NOTE, "steps": steps, "open": zone == "yellow"}


def _picked(triggers: list[str], word: str) -> bool:
    return any(word in str(trigger).lower() for trigger in triggers or [])


def weather_flags(environment: Optional[dict[str, Any]], triggers: list[str]) -> list[dict[str, str]]:
    """Conditions worth a note today. Air quality for everyone; the rest only if the user picked them."""
    env = environment or {}
    flags: list[dict[str, str]] = []
    aqi = env.get("aqi_band")
    if aqi is not None and aqi >= AQI_FLAG_BAND:
        flags.append({"key": "air_quality", "label": f"air quality is {str(env.get('aqi_label') or 'poor').lower()}", "picked": ""})
    if env.get("pollen") in POLLEN_FLAG_LEVELS and _picked(triggers, "pollen"):
        flags.append({"key": "pollen", "label": f"pollen is {env['pollen'].lower()}", "picked": "pollen"})
    low, high = env.get("temperature_low_f"), env.get("temperature_high_f")
    if low is not None and low <= COLD_FLAG_F and _picked(triggers, "cold"):
        flags.append({"key": "cold", "label": f"it drops to {low}°F", "picked": "cold air"})
    if low is not None and high is not None and high - low >= TEMP_RANGE_FLAG_F and _picked(triggers, "weather change"):
        flags.append({"key": "temperature_swing", "label": f"temperatures swing from {high}° to {low}°F", "picked": "weather changes"})
    return flags


def because_line(flags: list[dict[str, str]]) -> Optional[str]:
    """What today's conditions note is based on, e.g. 'Because it drops to 31°F and you picked cold air.'

    What the user logged is shown with their plan steps, so it isn't repeated here.
    """
    if not flags:
        return None
    picked = [flag["picked"] for flag in flags if flag["picked"]]
    conditions = _join([flag["label"] for flag in flags])
    if len(flags) == 1:
        return f"Because {conditions} and you picked {picked[0]}." if picked else f"Because {conditions}."
    # several conditions read better as two sentences
    return f"Because {conditions}." + (f" You picked {_join(picked)} in your Profile." if picked else "")


def help_link(check_ins: list[dict[str, Any]], state: dict[str, Any]) -> dict[str, Any]:
    """Where the Breathing help link sits: {"top": bool, "lead": str|None}.

    Top when the latest check-in had a Strong score or limited activity, or after
    symptoms 2 days in a row. Every other day it stays as a small link at the bottom.
    """
    if state["state"] not in ("yellow", "escalate"):
        return {"top": False, "lead": None}
    latest = next(entry for entry in check_ins if entry and entry.get("date") == state["date"])
    strong = any(score >= STRONG_SCORE for score in (latest.get("breathing_0_to_10") or {}).values())
    limited = bool(latest.get("activity_limitation"))
    if state["state"] == "escalate":
        # the fixed clinician line already says why
        return {"top": True, "lead": None}
    if strong or limited:
        return {"top": True, "lead": f"{HELP_TOP_LEADS[(strong, limited)]} {HELP_TOP_FOLLOW}"}
    return {"top": False, "lead": None}


def build_today_card(
    *,
    check_ins: list[dict[str, Any]],
    today: date,
    action_plan: Optional[dict[str, Any]],
    environment: Optional[dict[str, Any]],
    triggers: list[str],
) -> dict[str, Any]:
    state = symptom_state(check_ins, today)
    flags = weather_flags(environment, triggers)
    return {
        "symptoms": state,
        "plan": plan_steps(action_plan, state["state"]),
        "flags": flags,
        "because": because_line(flags),
        "help": help_link(check_ins, state),
    }


def llm_view(card: dict[str, Any]) -> dict[str, Any]:
    """The only parts of the card the LLM may see: labels, never the plan."""
    return {
        "symptom_state": card["symptoms"]["state"],
        "logged_signs": card["symptoms"]["signs"],
        "weather_flags": [flag["label"] for flag in card["flags"]],
    }
