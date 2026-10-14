"""Action plan / asthma support profile fields (no database needed)."""

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from api.user_schemas import UserProfileUpdate
from api.users import apply_profile_fields


def test_action_plan_round_trips_onto_the_user():
    body = UserProfileUpdate.model_validate(
        {
            "action_plan": {
                "yellow": {"quick_relief_medicine": "Albuterol", "dose_device": "2 puffs, inhaler", "repeat_every_minutes": 20, "max_doses": 3},
                "red": {"emergency": "Call 911"},
            },
            "asthma_support": {"peak_flow": {"personal_best": 450}, "clinician": {"name": "Dr. Lee", "phone": "555-0100"}},
        }
    )
    user = SimpleNamespace()
    apply_profile_fields(user, body)

    assert user.action_plan["yellow"]["repeat_every_minutes"] == 20
    assert user.action_plan["red"]["emergency"] == "Call 911"
    assert user.asthma_support["clinician"]["name"] == "Dr. Lee"


@pytest.mark.parametrize(
    "payload",
    [
        {"action_plan": {"yellow": {"max_doses": 0}}},
        {"action_plan": {"orange": {}}},
        {"asthma_support": {"peak_flow": {"personal_best": 5000}}},
    ],
)
def test_invalid_plans_are_rejected(payload):
    with pytest.raises(ValidationError):
        UserProfileUpdate.model_validate(payload)
