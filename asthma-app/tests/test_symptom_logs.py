"""Quick logs: API, Day check-in pre-fill rules and the Today card roll-up."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from services.symptom_log_service import context_from_logs, prefill_from_logs
from services.today_card_service import build_today_card, symptom_state

DAY = date(2026, 10, 21)


def _log(time: str, offset: str = "+00:00", **fields) -> dict:
    breathing = {"shortness_of_breath": 0, "chest_tightness": 0, "wheezing": 0, "coughing": 0}
    breathing.update(fields.pop("breathing", {}))
    return {"logged_at": f"2026-10-21T{time}:00{offset}", "breathing": breathing, **fields}


# ---------- pre-fill rules (plan table) ----------


def test_no_logs_leaves_every_answer_for_the_person():
    result = prefill_from_logs([], puffs_today=0)
    assert result["log_count"] == 0
    assert result["breathing"] is None
    assert result["no_symptoms"] is None
    assert result["night_symptoms"] is None
    assert result["activity_limited"] is None


def test_sliders_start_at_the_highest_value_logged_with_its_source():
    logs = [_log("08:05", breathing={"wheezing": 3}), _log("14:10", breathing={"wheezing": 5, "coughing": 2})]
    result = prefill_from_logs(logs, puffs_today=2)
    assert result["breathing"] == {"shortness_of_breath": 0, "chest_tightness": 0, "wheezing": 5, "coughing": 2}
    assert result["breathing_from"]["wheezing"] == "2026-10-21T14:10:00+00:00"
    assert result["no_symptoms"] is False
    assert result["puffs"] == 2


def test_all_zero_logs_offer_no_symptoms_but_never_answer_night_or_activity():
    result = prefill_from_logs([_log("08:05"), _log("14:10")], puffs_today=0)
    assert result["no_symptoms"] is True
    assert result["night_symptoms"] is None
    assert result["activity_limited"] is None


def test_a_symptom_logged_between_midnight_and_6am_local_suggests_night_waking():
    # 10:30 UTC is 3:30 am in UTC-7 (JS getTimezoneOffset 420)
    night = _log("10:30", breathing={"coughing": 4})
    assert prefill_from_logs([night], 0, tz_offset_minutes=420)["night_symptoms"] is True
    # the same moment is 10:30 am in UTC
    assert prefill_from_logs([night], 0, tz_offset_minutes=0)["night_symptoms"] is None
    # a symptom-free night log doesn't count
    assert prefill_from_logs([_log("10:30")], 0, tz_offset_minutes=420)["night_symptoms"] is None


def test_limiting_chip_suggests_yes_and_triggers_are_merged():
    logs = [_log("09:00", triggers=["Pollen"]), _log("14:10", limiting_activity=True, triggers=["pollen", "Exercise"])]
    result = prefill_from_logs(logs, 0)
    assert result["activity_limited"] is True
    assert result["activity_from"] == "2026-10-21T14:10:00+00:00"
    assert result["triggers"] == ["Pollen", "Exercise"]


# ---------- Today card ----------


def test_quick_logs_make_today_yellow_and_say_so():
    entry = context_from_logs([_log("14:10", breathing={"wheezing": 5})], DAY, puffs_today=2)
    state = symptom_state([entry], DAY)
    assert state["state"] == "yellow"
    assert state["lead"] == "You logged noticeable wheezing and 2 reliever puffs in a quick log on Wed, Oct 21."
    assert entry["night_waking"] is False


def test_symptom_free_quick_logs_are_green():
    entry = context_from_logs([_log("08:05")], DAY, puffs_today=0)
    state = symptom_state([entry], DAY)
    assert state["state"] == "green"
    assert state["lead"] == "Your quick logs on Wed, Oct 21 had no symptoms."


def test_a_strong_quick_log_moves_breathing_help_to_the_top():
    entry = context_from_logs([_log("14:10", breathing={"chest_tightness": 8})], DAY, puffs_today=0)
    card = build_today_card(check_ins=[entry], today=DAY, action_plan=None, environment=None, triggers=[])
    assert card["help"]["top"] is True


def test_quick_log_days_count_toward_two_days_in_a_row():
    today = context_from_logs([_log("14:10", breathing={"wheezing": 2})], DAY, puffs_today=0)
    yesterday = {"date": (DAY - timedelta(days=1)).isoformat(), "breathing_0_to_10": {"coughing": 3}}
    assert symptom_state([today, yesterday], DAY)["state"] == "escalate"


# ---------- API ----------


def test_quick_log_api_round_trip_and_puffs_stay_in_the_day_total(client: TestClient, auth_headers: dict):
    today = date.today()
    created = client.post(
        "/v1/symptom-logs",
        json={"local_date": today.isoformat(), "breathing": {"wheezing": 5}, "reliever_puffs": 2, "triggers": ["Exercise"]},
        headers=auth_headers,
    )
    assert created.status_code == 201
    log = created.json()
    assert log["breathing"]["wheezing"] == 5 and log["breathing"]["coughing"] == 0

    assert client.get("/v1/check-ins/today", headers=auth_headers).json()["puffs_today"] == 2

    listed = client.get(f"/v1/symptom-logs?from={today.isoformat()}", headers=auth_headers).json()["items"]
    assert [item["id"] for item in listed] == [log["id"]]

    prefill = client.get(f"/v1/symptom-logs/prefill?date={today.isoformat()}", headers=auth_headers).json()
    assert prefill["breathing"]["wheezing"] == 5
    assert prefill["puffs"] == 2
    assert prefill["triggers"] == ["Exercise"]

    edited = client.patch(f"/v1/symptom-logs/{log['id']}", json={"reliever_puffs": 1}, headers=auth_headers)
    assert edited.json()["reliever_puffs"] == 1
    assert client.get("/v1/check-ins/today", headers=auth_headers).json()["puffs_today"] == 1

    assert client.delete(f"/v1/symptom-logs/{log['id']}", headers=auth_headers).status_code == 204
    assert client.get("/v1/check-ins/today", headers=auth_headers).json()["puffs_today"] == 0
    # logging puffs is not a Day check-in
    assert client.get("/v1/check-ins/today", headers=auth_headers).json()["symptoms_logged"] is False


def test_quick_log_rejects_out_of_range_scores(client: TestClient, auth_headers: dict):
    response = client.post("/v1/symptom-logs", json={"breathing": {"wheezing": 11}}, headers=auth_headers)
    assert response.status_code == 400


def test_quick_logs_are_private_to_their_owner(client: TestClient, auth_headers: dict):
    log = client.post("/v1/symptom-logs", json={"breathing": {"coughing": 1}}, headers=auth_headers).json()
    other = client.post(
        "/v1/auth/register",
        json={"email": "other-quick-log@example.com", "password": "securepass123", "name": "Other User"},
    )
    assert other.status_code == 201, other.text
    headers = {"Authorization": f"Bearer {other.json()['access_token']}"}
    assert client.delete(f"/v1/symptom-logs/{log['id']}", headers=headers).status_code == 404
    assert client.get("/v1/symptom-logs?from=2000-01-01&to=2100-01-01", headers=headers).json()["items"] == []
