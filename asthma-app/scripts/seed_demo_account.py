"""Give an existing demo account several weeks of made-up check-in history, and take it away again.

For demos only (e.g. the lobeliatesting@gmail.com login). Every value is invented;
nothing comes from a real person. The account must already exist: this script never
creates users or touches the profile.

What it writes, for each past day (yesterday back ``--days`` days; today is left alone
so you can check in live on camera):
- one Day check-in (check_ins row) with the required fields the form asks for:
  0-10 sliders, woke at night, activity limited, rescue puffs; mood, triggers and a
  short note on some days, like a real person would;
- 0-3 Quick logs (symptom_logs rows) at believable times;
- optionally the day's plans (the weekly class / gym schedule) on the same row.

The made-up person has a weekly routine (classes Mon/Wed/Fri, gym Mon/Thu, study group
Mon/Wed) and a pattern Insights can surface: tighter chest and wheezing in the evening
after gym, a cold snap three weeks ago, a head cold about six weeks ago, and a calm last
few days so Today opens quiet.

Safe by default:
- dry run unless ``--apply``; refuses non-local databases unless ``--allow-remote``;
- skips any day that already has a check-in row (real entries are never overwritten);
- every row gets an id derived from (account, date, slot), so ``--undo`` deletes exactly
  the rows this script made and nothing else, on any later day. Re-running is a no-op for days already seeded.

    python scripts/seed_demo_account.py --email lobeliatesting@gmail.com            # dry run
    python scripts/seed_demo_account.py --email lobeliatesting@gmail.com --apply
    python scripts/seed_demo_account.py --email lobeliatesting@gmail.com --undo --apply
"""

from __future__ import annotations

import argparse
import random
import sys
import uuid
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, or_, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from db.models import CheckIn, InhalerEvent, SymptomLog, User

SEED_TAG = "demo-history-v1"
# Fixed namespace so ids are stable across runs (and --undo can recompute them).
SEED_NAMESPACE = uuid.UUID("6f4b1c2e-9d3a-4e57-8a61-1b0c5d7e9f20")
LOCAL_DB_HOSTS = {None, "localhost", "127.0.0.1", "postgres", "db"}
SYMPTOMS = ("shortness_of_breath", "chest_tightness", "wheezing", "coughing")
SYMPTOM_LABELS = {
    "shortness_of_breath": "shortness of breath",
    "chest_tightness": "chest tightness",
    "wheezing": "wheezing",
    "coughing": "coughing",
}
MOOD_LABELS = {1: "Very low", 2: "Low", 3: "Okay", 4: "Good", 5: "Great"}
MAX_LOGS_PER_DAY = 3
UNDO_WINDOW_DAYS = 400

# The weekly routine from the demo account's "Your day" (weekday: Mon=0).
WEEKLY_PLANS: dict[int, list[dict]] = {}
_BIO = {"key": "bio", "title": "BIO 201 — Lecture", "start": "09:00", "end": "10:15", "location": "Science Hall 214",
        "environment": "indoor", "intensity": "low"}
_MATH = {"key": "math", "title": "MATH 201", "start": "11:00", "end": "12:15", "location": None,
         "environment": "indoor", "intensity": "low"}
_GYM = {"key": "gym", "title": "Gym — cardio + weights", "start": "17:30", "end": "18:30", "location": "Campus Rec Center",
        "environment": "indoor", "intensity": "high"}
_STUDY = {"key": "study", "title": "Study group — STAT 120", "start": "19:00", "end": "21:00", "location": "Library Room 3B",
          "environment": "indoor", "intensity": "low"}
for _weekday in (0, 2, 4):
    WEEKLY_PLANS.setdefault(_weekday, []).extend([_BIO, _MATH])
for _weekday in (0, 3):
    WEEKLY_PLANS.setdefault(_weekday, []).append(_GYM)
for _weekday in (0, 2):
    WEEKLY_PLANS.setdefault(_weekday, []).append(_STUDY)
for _plans in WEEKLY_PLANS.values():
    _plans.sort(key=lambda plan: plan["start"])

GYM_NOTES = ["Chest felt tight on the treadmill.", "Wheezy after the cardio part.", "Short warm-up today, felt it after.", None, None]
COLD_NOTES = ["Freezing walk to class.", "Cold wind this morning.", "Kept my scarf over my mouth, helped a bit.", None]
FLU_NOTES = ["Head cold, coughing a lot.", "Still sniffly.", "Slept badly, coughing.", None]
CALM_NOTES = ["Good day.", "Felt fine.", None, None, None, None, None, None]


def seeded_id(user_id: uuid.UUID, day: date, slot: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, f"{user_id}:{day.isoformat()}:{slot}")


def _zero() -> dict[str, int]:
    return {key: 0 for key in SYMPTOMS}


def _clamp(value: int) -> int:
    return max(0, min(10, value))


def _episode(days_ago: int) -> Optional[str]:
    """Which made-up stretch a past day falls in (days_ago 1 = yesterday)."""
    if 20 <= days_ago <= 25:
        return "cold_snap"
    if 40 <= days_ago <= 44:
        return "head_cold"
    return None


def build_day(user_id: uuid.UUID, day: date, days_ago: int) -> Optional[dict[str, Any]]:
    """One made-up day: the Day check-in answers, its quick logs and plans. None = a missed day."""
    rng = random.Random(f"{SEED_TAG}:{user_id}:{day.isoformat()}")
    weekday = day.weekday()
    plans = WEEKLY_PLANS.get(weekday, [])
    gym = any(plan["key"] == "gym" for plan in plans)
    episode = _episode(days_ago)
    calm_tail = days_ago <= 4  # keep the last few days quiet so Today opens calm

    # a real person skips some days, but not the last few (Today reads them)
    if not calm_tail and episode is None and rng.random() < 0.1:
        return None

    breathing = _zero()
    triggers: list[str] = []
    night = False
    limited = False
    note_pool = CALM_NOTES
    logs: list[dict[str, Any]] = []

    if episode == "head_cold":
        breathing["coughing"] = rng.randint(5, 7)
        breathing["chest_tightness"] = rng.randint(1, 3)
        breathing["shortness_of_breath"] = rng.randint(0, 2)
        night = rng.random() < 0.6
        limited = rng.random() < 0.4
        triggers = ["A cold or flu"]
        note_pool = FLU_NOTES
        logs.append({"at": time(8, rng.randint(0, 40)), "scale": 1.0, "triggers": ["A cold or flu"]})
        if night:
            logs.append({"at": time(3, rng.randint(5, 50)), "scale": 0.8, "triggers": []})
    elif episode == "cold_snap":
        breathing["chest_tightness"] = rng.randint(3, 5)
        breathing["shortness_of_breath"] = rng.randint(2, 4)
        breathing["wheezing"] = rng.randint(1, 4)
        breathing["coughing"] = rng.randint(1, 3)
        night = days_ago in (21, 23)
        limited = rng.random() < 0.3
        triggers = ["Cold air"]
        note_pool = COLD_NOTES
        logs.append({"at": time(8, rng.randint(10, 50)), "scale": 1.0, "triggers": ["Cold air"]})
    elif calm_tail:
        breathing["coughing"] = 1 if days_ago == 3 else 0
        note_pool = CALM_NOTES
    elif rng.random() < 0.18:
        # an ordinary off day: a little cough or tightness, now and then dust
        breathing["coughing"] = rng.randint(1, 3)
        breathing["chest_tightness"] = rng.randint(0, 2)
        if rng.random() < 0.4:
            triggers.append("Dust")
        logs.append({"at": time(rng.randint(12, 15), rng.randint(0, 59)), "scale": 1.0, "triggers": list(triggers)})
    else:
        breathing["coughing"] = rng.choice([0, 0, 0, 1])

    if gym and not calm_tail and rng.random() < 0.25:
        # not every workout: a longer warm-up and it was fine
        breathing["chest_tightness"] = max(breathing["chest_tightness"], rng.randint(0, 2))
        note_pool = ["Longer warm-up today, felt fine.", None]
    elif gym and not calm_tail:
        # the pattern to find: evenings after gym are harder
        breathing["chest_tightness"] = max(breathing["chest_tightness"], rng.randint(3, 6))
        breathing["wheezing"] = max(breathing["wheezing"], rng.randint(2, 5))
        breathing["shortness_of_breath"] = max(breathing["shortness_of_breath"], rng.randint(2, 5))
        limited = limited or rng.random() < 0.35
        triggers = [*triggers, "Exercise"]
        note_pool = GYM_NOTES
        logs.append({"at": time(18, rng.randint(35, 55)), "scale": 1.0, "triggers": ["Exercise"], "gym": True})

    breathing = {key: _clamp(score) for key, score in breathing.items()}
    peak = max(breathing.values())

    # reliever puffs: logged on the quick logs at the worst moments, a few more added at the day check-in
    puffs_total = 0
    if peak >= 6:
        puffs_total = rng.choice([2, 2, 3])
    elif peak >= 4:
        puffs_total = rng.choice([0, 1, 2, 2])
    elif peak >= 3:
        puffs_total = rng.choice([0, 0, 1])

    quick_logs = []
    for index, spec in enumerate(sorted(logs, key=lambda item: item["at"])[:MAX_LOGS_PER_DAY]):
        scores = {key: _clamp(round(score * spec["scale"])) for key, score in breathing.items()}
        if spec.get("gym") is None and gym and spec["at"] < time(17, 30):
            # a log before the workout shows the calmer part of the day
            scores = {key: min(score, 2) for key, score in scores.items()}
        quick_logs.append({
            "slot": f"log{index}",
            "at": spec["at"],
            "breathing": scores,
            "limiting_activity": bool(limited and max(scores.values()) >= 4),
            "reliever_puffs": 0,
            "triggers": spec["triggers"],
            "note": rng.choice(GYM_NOTES[:2]) if spec.get("gym") and rng.random() < 0.4 else None,
        })
    if puffs_total and quick_logs:
        worst = max(quick_logs, key=lambda item: max(item["breathing"].values()))
        worst["reliever_puffs"] = max(1, puffs_total - rng.choice([0, 0, 1]))

    mood = None
    if rng.random() < 0.65:
        mood = 2 if peak >= 6 else 3 if peak >= 4 else rng.choice([3, 4, 4, 5])

    return {
        "date": day,
        "breathing": breathing,
        "night": night,
        "limited": limited,
        "puffs": puffs_total,
        "triggers": triggers,
        "mood": mood,
        "note": rng.choice(note_pool),
        "plans": plans,
        "quick_logs": quick_logs,
    }


def build_history(user_id: uuid.UUID, today: date, days: int) -> list[dict[str, Any]]:
    """Made-up days from ``days`` days ago through yesterday (missed days left out)."""
    history = []
    for days_ago in range(days, 0, -1):
        entry = build_day(user_id, today - timedelta(days=days_ago), days_ago)
        if entry is not None:
            history.append(entry)
    return history


def summary_line(entry: dict[str, Any]) -> str:
    """Same generated line the Day check-in form saves (frontend checkInMapping.summaryLine)."""
    def severity(score: int) -> str:
        return "no symptoms" if score <= 0 else "slight" if score <= 3 else "noticeable" if score <= 6 else "strong"

    parts = []
    if entry["mood"]:
        parts.append(f"Feeling: {MOOD_LABELS[entry['mood']]}")
    day_symp = any(entry["breathing"].values())
    parts.append(
        f"Daytime symptoms: {'yes' if day_symp else 'no'}, woke at night: {'yes' if entry['night'] else 'no'}, "
        f"activity limited: {'yes' if entry['limited'] else 'no'}, "
        f"rescue inhaler: {str(entry['puffs']) + ' puffs' if entry['puffs'] else 'no'}"
    )
    parts.append("Breathing: " + ", ".join(
        f"{SYMPTOM_LABELS[key]} {score}/10 ({severity(score)})" for key, score in entry["breathing"].items()
    ))
    if entry["triggers"]:
        parts.append(f"Possible triggers: {', '.join(entry['triggers'])}")
    line = "[Check-in] " + ". ".join(parts) + "."
    return f"{line}\n{entry['note']}" if entry["note"] else line


def _plan_events(user_id: uuid.UUID, day: date, plans: list[dict]) -> list[dict]:
    events = []
    for plan in plans:
        description = ". ".join(filter(None, [plan["environment"], f"{plan['intensity']} intensity"]))
        events.append({
            "id": f"manual-seed-{seeded_id(user_id, day, plan['key']).hex[:12]}",
            "title": plan["title"],
            "start": f"{day.isoformat()}T{plan['start']}",
            "end": f"{day.isoformat()}T{plan['end']}",
            "all_day": False,
            "location": plan["location"],
            "environment": plan["environment"],
            "intensity": plan["intensity"],
            "context": None,
            "notes": None,
            "description": description,
            "source": "manual",
        })
    return events


def find_user(db: Session, email: str) -> User:
    user = db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))
    if user is None:
        raise SystemExit(f"No Lobelia account with email {email!r}. Sign up first; this script never creates users.")
    return user


def apply_history(db: Session, user: User, history: list[dict], tz: ZoneInfo, with_plans: bool) -> dict[str, int]:
    """Insert the made-up days. Days that already have any check-in row are skipped."""
    days = [entry["date"] for entry in history]
    taken = set(db.scalars(select(CheckIn.date).where(CheckIn.user_id == user.id, CheckIn.date.in_(days))).all())
    taken_logs = set(db.scalars(
        select(SymptomLog.local_date).where(SymptomLog.user_id == user.id, SymptomLog.local_date.in_(days))
    ).all())
    counts = {"check_ins": 0, "quick_logs": 0, "plans": 0, "skipped_days": 0}
    for entry in history:
        day = entry["date"]
        if day in taken or day in taken_logs:
            counts["skipped_days"] += 1
            continue
        events = _plan_events(user.id, day, entry["plans"]) if with_plans else []
        details: dict[str, Any] = {
            "breathing": dict(entry["breathing"]),
            "context": [
                *(["night_waking"] if entry["night"] else []),
                *(["activity_limitation"] if entry["limited"] else []),
                *(["reliever_use"] if entry["puffs"] else []),
            ],
            "seed": SEED_TAG,
        }
        if entry["mood"]:
            details["mood"] = entry["mood"]
        db.add(CheckIn(
            id=seeded_id(user.id, day, "check_in"),
            user_id=user.id,
            date=day,
            daily_day_symp=any(entry["breathing"].values()),
            daily_night_symp=entry["night"],
            daily_limit_activity=entry["limited"],
            symptoms_logged=True,
            puffs_today=entry["puffs"],
            notes=summary_line(entry),
            triggers=entry["triggers"],
            # calendar_event (the old one-line summary) stays empty: Insights would count it as one more "plan"
            calendar_events=events or None,
            details=details,
        ))
        counts["check_ins"] += 1
        counts["plans"] += len(events)
        for log in entry["quick_logs"]:
            db.add(SymptomLog(
                id=seeded_id(user.id, day, log["slot"]),
                user_id=user.id,
                logged_at=datetime.combine(day, log["at"], tzinfo=tz),
                local_date=day,
                breathing=log["breathing"],
                limiting_activity=log["limiting_activity"],
                reliever_puffs=log["reliever_puffs"],
                triggers=log["triggers"],
                note=log["note"],
            ))
            counts["quick_logs"] += 1
    return counts


def undo_history(db: Session, user: User, today: date) -> dict[str, int]:
    """Delete only rows this script made: check-ins with its seed tag or one of its ids, quick logs with its ids.

    Ids are recomputed for every day in the year before ``today``, so undo works on any later day.
    """
    days = [today - timedelta(days=days_ago) for days_ago in range(1, UNDO_WINDOW_DAYS + 1)]
    check_in_ids = [seeded_id(user.id, day, "check_in") for day in days]
    log_ids = [seeded_id(user.id, day, f"log{index}") for day in days for index in range(MAX_LOGS_PER_DAY)]
    seeded_check_ins = db.scalars(select(CheckIn.id).where(
        CheckIn.user_id == user.id,
        or_(CheckIn.id.in_(check_in_ids), CheckIn.details["seed"].astext == SEED_TAG),
    )).all()
    events = check_ins = 0
    if seeded_check_ins:
        events = db.execute(delete(InhalerEvent).where(InhalerEvent.check_in_id.in_(seeded_check_ins))).rowcount
    logs = db.execute(delete(SymptomLog).where(SymptomLog.user_id == user.id, SymptomLog.id.in_(log_ids))).rowcount
    if seeded_check_ins:
        check_ins = db.execute(delete(CheckIn).where(CheckIn.id.in_(seeded_check_ins))).rowcount
    return {"check_ins": check_ins, "quick_logs": logs, "inhaler_events": events}


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True, help="The existing demo account to fill (e.g. lobeliatesting@gmail.com)")
    parser.add_argument("--days", type=int, default=90, help="How many past days to cover (default 90, fills the 90-day Insights view)")
    parser.add_argument("--timezone", default="America/Chicago", help="The account's local time zone for quick log times")
    parser.add_argument("--no-plans", action="store_true", help="Don't add the weekly class/gym plans to past days")
    parser.add_argument("--undo", action="store_true", help="Remove everything this script added for --email (any --days)")
    parser.add_argument("--apply", action="store_true", help="Actually write. Without it this is a dry run.")
    parser.add_argument("--allow-remote", action="store_true", help="Allow a non-local database (production)")
    args = parser.parse_args(argv)
    if not 7 <= args.days <= 180:
        parser.error("--days must be between 7 and 180")

    from db.database import DATABASE_URL, SessionLocal, database_reachable

    url = make_url(DATABASE_URL)
    if url.host not in LOCAL_DB_HOSTS and not args.allow_remote:
        parser.error(f"Refusing to write to remote database host {url.host!r}; pass --allow-remote explicitly")
    if not database_reachable():
        raise SystemExit("Could not connect to the database in DATABASE_URL.")

    tz = ZoneInfo(args.timezone)
    today = datetime.now(tz).date()
    print(f"Database: {url.host}/{url.database} · account: {args.email} · {args.days} days before {today}")

    with SessionLocal() as db:
        user = find_user(db, args.email)
        if args.undo:
            counts = undo_history(db, user, today)
            verb = "Removed"
        else:
            history = build_history(user.id, today, args.days)
            counts = apply_history(db, user, history, tz, with_plans=not args.no_plans)
            verb = "Added"
        if args.apply:
            db.commit()
        else:
            db.rollback()
            verb = f"Dry run (nothing saved) — would have {verb.lower()}"
        print(f"{verb}: " + ", ".join(f"{value} {key.replace('_', ' ')}" for key, value in counts.items()))
        if not args.apply:
            print("Add --apply to write.")


if __name__ == "__main__":
    main()
