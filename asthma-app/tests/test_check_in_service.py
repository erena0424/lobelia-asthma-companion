"""Tests for check-in completeness and flare-up derivation."""

from __future__ import annotations

from datetime import date

import pytest

from db.models import CheckIn, User
from services.auth_service import hash_password
from services.check_in_service import (
    check_in_complete,
    compute_is_flare_up_from_check_in,
    log_inhaler_puff,
    upsert_check_in,
)


def _make_user(db_session) -> User:
    user = User(email="checkin@example.com", password_hash=hash_password("password123"))
    db_session.add(user)
    db_session.flush()
    return user


def test_check_in_complete_requires_puff_or_symptoms(db_session):
    user = _make_user(db_session)
    day = date.today()

    assert check_in_complete(None) is False

    check_in = upsert_check_in(
        db_session,
        user.id,
        day=day,
        daily_day_symp=False,
        daily_night_symp=False,
        daily_limit_activity=False,
    )
    assert check_in_complete(check_in) is True

    user2 = User(email="puff@example.com", password_hash=hash_password("password123"))
    db_session.add(user2)
    db_session.flush()
    check_in2, _ = log_inhaler_puff(db_session, user2.id, day=day)
    assert check_in_complete(check_in2) is True


def test_symptom_defaults_are_false(db_session):
    user = _make_user(db_session)
    check_in = upsert_check_in(db_session, user.id, day=date.today())
    assert check_in.daily_day_symp is False
    assert check_in.daily_night_symp is False
    assert check_in.daily_limit_activity is False
    assert check_in.symptoms_logged is True


def test_is_flare_up_from_puffs(db_session):
    user = _make_user(db_session)
    check_in, _ = log_inhaler_puff(db_session, user.id, day=date.today())
    log_inhaler_puff(db_session, user.id, day=date.today())
    log_inhaler_puff(db_session, user.id, day=date.today())
    db_session.refresh(check_in)
    assert compute_is_flare_up_from_check_in(check_in) == 1


def test_is_flare_up_from_triple_symptoms(db_session):
    user = _make_user(db_session)
    check_in = upsert_check_in(
        db_session,
        user.id,
        day=date.today(),
        daily_day_symp=True,
        daily_night_symp=True,
        daily_limit_activity=True,
    )
    assert compute_is_flare_up_from_check_in(check_in) == 1


def test_check_in_context_reports_detail_but_never_the_note():
    from datetime import date as _date

    from db.models import CheckIn
    from services.check_in_service import check_in_context, describe_check_in

    check_in = CheckIn(
        date=_date(2026, 10, 15),
        puffs_today=2,
        daily_day_symp=True,
        daily_night_symp=True,
        daily_limit_activity=False,
        symptoms_logged=True,
        notes="private words",
        triggers=["pollen"],
        details={"mood": 3, "breathing": {"wheezing": 6, "coughing": 0}, "context": ["night_waking"]},
    )
    entry = check_in_context(check_in)
    assert entry["mood"] == "okay"
    assert entry["breathing_0_to_10"] == {"wheezing": 6}
    assert entry["night_waking"] is True and entry["reliever_puffs"] == 2
    assert entry["possible_triggers_noted"] == ["pollen"]
    assert "private words" not in str(entry)
    assert describe_check_in(entry) == (
        "mood okay; wheezing 6/10; woke at night; reliever used (2 puffs); possible triggers they noted: pollen"
    )
    assert check_in_context(None) is None
