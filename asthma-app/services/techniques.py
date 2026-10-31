"""Reviewed self-management techniques for Today's tips (LOB-57).

Code picks which techniques fit the day; the LLM may only reword one of the
candidates it is offered for a slot, and must return that candidate's id.
Every line here is fixed text that can be shown as-is when the LLM is down.

Sources are the allowlisted public guidance (CDC, EPA AirNow, NHLBI EPR-3) plus
the ATS 2013 exercise guideline where noted. A literature read by a non-clinician
agent, not a clinician's sign-off: plan doc https://claude.ai/artifact/1E5nZmE3Ke1nFRwYX16e5f
"""

from __future__ import annotations

import hashlib
from datetime import date
from typing import Any, Optional

# situation -> techniques. "source" is for reviewers; it is never shown inline.
TECHNIQUES: dict[str, dict[str, str]] = {
    "AQ1": {"situation": "air_active", "source": "EPR-3 §3; EPA AirNow",
            "text": "The air isn't great today. If you can, moving a hard workout indoors might be the gentler choice."},
    "AQ2": {"situation": "air_ozone", "source": "EPA ozone and patients",
            "text": "If you can, a morning workout might be nicer today, since ozone is usually lower then."},
    "AQ3": {"situation": "air", "source": "EPA AirNow",
            "text": "If you're heading out, it's fine to keep things shorter and lighter today, with a few more breaks."},
    "AQ4": {"situation": "air_smoke", "source": "EPA AirNow: Fires and Your Health",
            "text": "With smoke in the air, staying in with the windows closed might be the cozier choice today."},
    "OD1": {"situation": "outdoor", "source": "EPA AirNow",
            "text": "Before you head out, a quick look at the air quality can help you plan your time outside."},
    "PO1": {"situation": "pollen", "source": "EPR-3 §3",
            "text": "With pollen high, keeping windows closed at home and in the car is a simple way to keep more of it outside."},
    "PO2": {"situation": "pollen_outdoor", "source": "EPR-3 §3",
            "text": "After being outdoors, a shower and a change of clothes is a nice way to leave the pollen outside."},
    "CO1": {"situation": "cold_outdoor", "source": "ATS 2013 (mask in cold air, conditional)",
            "text": "If you're out in the cold, a scarf over your nose and mouth can help warm the air you breathe."},
    "EX1": {"situation": "exercise", "source": "ATS 2013 (warm-up, strong); EPR-3",
            "text": "Before you get going, some people with asthma like an easy warm-up of about 10 minutes."},
    "EX2": {"situation": "exercise", "source": "EPR-3 (to confirm)",
            "text": "Afterwards, easing off with a gentle cool-down is a nice way to finish."},
    # Exercise plans on days the clinician line shows (3 days of symptoms in a row): never a warm-up nudge.
    "EZ1": {"situation": "ease", "source": "NHLBI Asthma Action Plan (Yellow zone: activity may be limited); ATS 2013",
            "text": "It's okay to keep this one lighter today, or skip it, and take breaks whenever you like."},
    "SC1": {"situation": "fumes", "source": "CDC Controlling Asthma",
            "text": "If scents or fumes get strong, it's okay to step out for some fresh air."},
    # Everyday habits: quiet days only, chosen by code, never sent to the LLM.
    "HB1": {"situation": "habit", "source": "CDC; EPR-3",
            "text": "Next time you see your clinician, you could ask them to check your inhaler technique."},
    "HB2": {"situation": "habit", "source": "CDC Living with Asthma",
            "text": "Your next visit could be a good moment to go over your action plan together."},
    "HB3": {"situation": "habit", "source": "CDC Living with Asthma",
            "text": "It can be reassuring to share your action plan with someone close to you."},
    "HB4": {"situation": "habit", "source": "CDC",
            "text": "On days with symptoms, a quick note about what was around you can help you and your clinician spot patterns over time."},
    "HB5": {"situation": "habit", "source": "CDC Controlling Asthma",
            "text": "A smoke-free home and car, with no vaping too, is a kind thing to ask of the people around you."},
    "HB6": {"situation": "habit", "source": "EPR-3 §3",
            "text": "Washing your bedding in hot water each week is one way to cut down on dust mites."},
    "HB7": {"situation": "habit_calm", "source": "Cochrane CD001277 (breathing exercises)",
            "text": "On a calm day, you might try a few minutes of slow, relaxed breathing so it feels familiar."},
    "HB8": {"situation": "habit", "source": "GINA (to confirm)",
            "text": "Staying active in ways you enjoy is part of living well with asthma."},
    "HB9": {"situation": "habit", "source": "NHLBI Asthma Action Plan",
            "text": "Getting to know your early signs, like coughing at night, can help you notice changes sooner."},
}

# Code-only lines from the person's own saved plan (Elena, 2026-10-22, decisions 3a/3b).
RELIEVER_REMINDER = "You might like to keep your quick-relief inhaler with you today."
BEFORE_EXERCISE_LEAD = "From your plan, before exercise:"

# Techniques that assume a workout goes ahead as usual. Left out while the clinician line shows.
NOT_WHEN_ESCALATED = ("EX1", "EX2", "AQ1", "AQ2")

NO_TIP_SUMMARY = "Add events to your calendar for tips about your day."
MAX_CANDIDATES = 4
EXERCISE_WORDS = ("run", "jog", "gym", "workout", "soccer", "football", "basketball", "tennis", "swim", "bike",
                  "cycling", "hike", "skat", "yoga", "dance", "practice", "training", "climb", "ski")
FUMES_WORDS = ("scent", "smell", "perfume", "fume", "chemical", "smoke", "paint", "cleaning")

# EPA AQI breakpoints for the "Unhealthy for sensitive groups" band and above.
PM25_USG_UGM3 = 35.5  # 24-hour PM2.5
O3_USG_PPB = 71  # 8-hour ozone
O3_UGM3_PER_PPB = 1.96  # at 25 °C


def _words(event: dict[str, Any]) -> str:
    return " ".join(str(event.get(key) or "") for key in ("title", "context", "notes")).lower()


def is_outdoor(event: dict[str, Any]) -> bool:
    return str(event.get("environment") or "").lower() in ("outdoor", "both")


def is_exercise(event: dict[str, Any]) -> bool:
    if str(event.get("intensity") or "").lower() in ("moderate", "hard", "high"):
        return True
    return any(word in _words(event) for word in EXERCISE_WORDS)


def main_pollutant(environment: Optional[dict[str, Any]]) -> Optional[str]:
    """'ozone' | 'pm2_5' | None: which pollutant is past its sensitive-groups breakpoint.

    Daily means from Open-Meteo stand in for EPA's 8-hour and 24-hour averages.
    """
    env = environment or {}
    over = {}
    if isinstance(env.get("pm2_5"), (int, float)) and env["pm2_5"] >= PM25_USG_UGM3:
        over["pm2_5"] = env["pm2_5"] / PM25_USG_UGM3
    if isinstance(env.get("o3"), (int, float)) and env["o3"] / O3_UGM3_PER_PPB >= O3_USG_PPB:
        over["ozone"] = env["o3"] / O3_UGM3_PER_PPB / O3_USG_PPB
    return max(over, key=over.get) if over else None


def situations_for_flags(flag_keys: set[str], pollutant: Optional[str]) -> list[str]:
    """Situations for the day's summary. A temperature swing has no reviewed technique yet."""
    situations = []
    if "air_quality" in flag_keys:
        situations += {"ozone": ["air_ozone"], "pm2_5": ["air_smoke"]}.get(pollutant, []) + ["air"]
    if "pollen" in flag_keys:
        situations.append("pollen")
    if "cold" in flag_keys:
        situations.append("cold_outdoor")
    return situations


def situations_for_event(event: dict[str, Any], flag_keys: set[str], pollutant: Optional[str], escalated: bool = False) -> list[str]:
    """Most specific first. While the clinician line shows, an exercise plan leads with easing off."""
    outdoor, exercise = is_outdoor(event), is_exercise(event)
    situations = ["ease"] if escalated and exercise else []
    if any(word in _words(event) for word in FUMES_WORDS):
        situations.append("fumes")
    if "air_quality" in flag_keys and (outdoor or exercise):
        if pollutant == "pm2_5":
            situations.append("air_smoke")
        if exercise:
            situations.append("air_active")
        if pollutant == "ozone" and exercise:
            situations.append("air_ozone")
        situations.append("air")
    if (outdoor and "cold" in flag_keys) or "cold" in _words(event):
        situations.append("cold_outdoor")
    if outdoor and "pollen" in flag_keys:
        situations.append("pollen_outdoor")
    if exercise:
        situations.append("exercise")
    if outdoor:
        situations.append("outdoor")
    return situations


def _rotate(ids: list[str], seed: str) -> list[str]:
    """Same order for the same day and slot; a different one on other days."""
    return sorted(ids, key=lambda tid: hashlib.sha256(f"{seed}:{tid}".encode()).hexdigest())


def candidates(situations: list[str], day: date, slot: str, exclude: tuple[str, ...] = ()) -> list[str]:
    """Up to MAX_CANDIDATES ids, keeping the most specific situation first."""
    picked: list[str] = []
    for situation in dict.fromkeys(situations):
        ids = [tid for tid, item in TECHNIQUES.items() if item["situation"] == situation and tid not in exclude]
        for tid in _rotate(ids, f"{day.isoformat()}:{slot}:{situation}"):
            if tid not in picked:
                picked.append(tid)
    return picked[:MAX_CANDIDATES]


def habit_for_day(day: date, calm: bool) -> str:
    """One everyday habit for a quiet day. Breathing practice only when nothing was logged."""
    situations = ("habit", "habit_calm") if calm else ("habit",)
    ids = [tid for tid, item in TECHNIQUES.items() if item["situation"] in situations]
    return TECHNIQUES[_rotate(ids, day.isoformat())[0]]["text"]


def offered(ids: list[str]) -> list[dict[str, str]]:
    """What the LLM sees for a slot: id and wording, nothing else."""
    return [{"id": tid, "text": TECHNIQUES[tid]["text"]} for tid in ids]


def text(tid: str) -> str:
    return TECHNIQUES[tid]["text"]


def _clean(value: Any) -> Optional[str]:
    cleaned = str(value).strip() if value is not None else ""
    return cleaned or None


def has_reliever(action_plan: Optional[dict[str, Any]], asthma_support: Optional[dict[str, Any]]) -> bool:
    """True only when the person saved a quick-relief medicine; we never assume they have one."""
    yellow = (action_plan or {}).get("yellow") if isinstance(action_plan, dict) else None
    from_plan = isinstance(yellow, dict) and _clean(yellow.get("quick_relief_medicine"))
    from_support = isinstance(asthma_support, dict) and _clean(asthma_support.get("rescue_inhaler"))
    return bool(from_plan or from_support)


def before_exercise_step(action_plan: Optional[dict[str, Any]]) -> Optional[str]:
    green = (action_plan or {}).get("green") if isinstance(action_plan, dict) else None
    return _clean(green.get("before_exercise")) if isinstance(green, dict) else None


# Assembling the day's tips (pure, stdlib only, so the mock API can use it too)

def slot_candidates(card: dict[str, Any], events: list[dict[str, Any]], environment: dict[str, Any] | None, day: date) -> dict[str, Any]:
    """Which techniques code offers: {"summary": [ids], "events": {event_id: [ids]}}."""
    flag_keys = {flag["key"] for flag in card["flags"]}
    pollutant = (environment or {}).get("main_pollutant")
    # 3 days of symptoms in a row: the plan and clinician line lead, tips stay low-key (Elena, 2026-10-31)
    escalated = card["symptoms"]["state"] == "escalate"
    exclude = NOT_WHEN_ESCALATED if escalated else ()
    by_event = {
        event["id"]: candidates(situations_for_event(event, flag_keys, pollutant, escalated), day, event["id"], exclude)
        for event in events
        if not event["all_day"]
    }
    summary = candidates(situations_for_flags(flag_keys, pollutant), day, "summary", exclude)
    from_flags = bool(summary)
    if not summary and not escalated:
        # the event tips already sit right under the safety lines, so no extra day tip then
        summary = next((ids for ids in by_event.values() if ids), [])
    return {"summary": summary, "from_flags": from_flags, "events": {event_id: ids for event_id, ids in by_event.items() if ids}}


def apply_output(slots: dict[str, Any], output: dict[str, Any] | None) -> dict[str, Any]:
    """Keep the LLM's wording only where it names a technique it was offered; else the fixed text."""
    output = output or {}
    summary, summary_id = None, None
    if slots["summary"]:
        if output.get("summary") and output.get("summary_technique") in slots["summary"]:
            summary, summary_id = output["summary"], output["summary_technique"]
        else:
            summary_id = slots["summary"][0]
            summary = text(summary_id)
    written = {tip["id"]: tip for tip in output.get("tips") or []}
    tips = {}
    for event_id, ids in slots["events"].items():
        tip = written.get(event_id)
        if tip and tip.get("technique") in ids:
            tips[event_id] = tip["tip"]
        else:
            # avoid repeating the summary's technique word for word when there's another one
            fallback = next((tid for tid in ids if tid != summary_id), ids[0])
            tips[event_id] = text(fallback)
    return {"summary": summary, "tips": tips}


def plan_extras(user: Any, card: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    """Lines from the person's own saved plan, added by code and never seen by the LLM (decisions 3a/3b)."""
    action_plan = getattr(user, "action_plan", None)
    timed = [event for event in events if not event["all_day"]]
    busy_outside = any(is_outdoor(event) or is_exercise(event) for event in timed)
    reminder = None
    if has_reliever(action_plan, getattr(user, "asthma_support", None)) and (card["flags"] or busy_outside):
        reminder = RELIEVER_REMINDER
    step = before_exercise_step(action_plan)
    plan_steps = {event["id"]: f"{BEFORE_EXERCISE_LEAD} {step}" for event in timed if step and is_exercise(event)}
    return {"reliever_reminder": reminder, "plan_steps": plan_steps}


def quiet_day(card: dict[str, Any], day: date) -> dict[str, Any]:
    """No timed events and nothing flagged: one habit, plus the nudge to add plans (Elena, 2026-10-22)."""
    state = card["symptoms"]["state"]
    if state in ("none", "green"):
        return {"summary": habit_for_day(day, calm=state == "green"), "nudge": NO_TIP_SUMMARY}
    if state == "escalate":
        # the safety lines lead; the nudge sits under them
        return {"summary": None, "nudge": NO_TIP_SUMMARY}
    return {"summary": NO_TIP_SUMMARY, "nudge": None}
