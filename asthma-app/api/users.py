"""User profile routes."""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field, StrictBool, field_validator

from sqlalchemy.orm import Session

from api.deps import get_current_user
from api.user_schemas import (
    EmergencyContact,
    UserProfile,
    UserProfileUpdate,
    emergency_contacts_to_legacy_string,
)
from db.database import get_db
from db.models import User

router = APIRouter(prefix="/users", tags=["users"])

_PROFILE_COLUMNS = (
    "name",
    "profile_image_url",
    "date_of_birth",
    "emergency_contact",
    "emergency_contacts",
    "preferred_reminder",
    "contact_method",
    "preferred_environment",
    "care_goal",
    "accessibility_needs",
    "trigger_preferences",
    "trigger_sensitivities",
    "symptoms",
    "tracking",
    "action_plan",
    "asthma_support",
)


def _serialize_contacts(raw: list | None) -> list[EmergencyContact]:
    if not raw:
        return []
    return [EmergencyContact.model_validate(item) for item in raw]


def _to_profile(user: User) -> UserProfile:
    return UserProfile(
        id=str(user.id),
        email=user.email,
        name=user.name,
        profile_image_url=user.profile_image_url,
        date_of_birth=user.date_of_birth,
        emergency_contact=user.emergency_contact,
        emergency_contacts=_serialize_contacts(user.emergency_contacts),
        preferred_reminder=user.preferred_reminder,
        contact_method=user.contact_method,
        preferred_environment=user.preferred_environment,
        care_goal=user.care_goal,
        accessibility_needs=user.accessibility_needs,
        trigger_preferences=user.trigger_preferences or [],
        trigger_sensitivities=user.trigger_sensitivities or {},
        symptoms=user.symptoms or [],
        tracking=user.tracking or [],
        action_plan=user.action_plan,
        asthma_support=user.asthma_support,
    )


def apply_profile_fields(user: User, data: UserProfileUpdate | dict) -> None:
    """Apply non-null profile fields onto a User row."""
    if isinstance(data, UserProfileUpdate):
        payload = data.model_dump(exclude_unset=True)
    else:
        payload = {k: v for k, v in data.items() if v is not None}

    if "emergency_contacts" in payload and payload["emergency_contacts"] is not None:
        contacts = [
            c.model_dump() if isinstance(c, EmergencyContact) else c
            for c in payload["emergency_contacts"]
        ]
        payload["emergency_contacts"] = contacts
        if payload.get("emergency_contact") is None:
            payload["emergency_contact"] = emergency_contacts_to_legacy_string(contacts)
        # The canonical array must also clear the legacy fallback.
        if not contacts:
            user.emergency_contact = None
            payload["emergency_contact"] = None

    for key in _PROFILE_COLUMNS:
        if key in payload and payload[key] is not None:
            setattr(user, key, payload[key])


@router.get("/me", response_model=UserProfile)
def get_me(user: User = Depends(get_current_user)) -> UserProfile:
    return _to_profile(user)


@router.patch("/me", response_model=UserProfile)
def update_me(
    body: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProfile:
    apply_profile_fields(user, body)
    db.commit()
    db.refresh(user)
    return _to_profile(user)


class SupportMemoryWrite(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    check_in_date: date | None = None
    approved: StrictBool
    model_config = {"extra": "forbid"}

    @field_validator("approved")
    @classmethod
    def require_approval(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Explicit approval is required")
        return value

    @field_validator("text")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Summary cannot be blank")
        return value


@router.get("/me/support-memory")
def get_support_memory(user: User = Depends(get_current_user)) -> dict:
    return {"summary": user.support_memory}


@router.put("/me/support-memory")
def save_support_memory(
    body: SupportMemoryWrite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    user.support_memory = {
        "text": body.text,
        "check_in_date": body.check_in_date.isoformat() if body.check_in_date else None,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "source": "user-reported",
    }
    db.commit()
    db.refresh(user)
    return {"summary": user.support_memory}


@router.delete("/me/support-memory", status_code=204)
def delete_support_memory(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    user.support_memory = None
    db.commit()
    return Response(status_code=204)
