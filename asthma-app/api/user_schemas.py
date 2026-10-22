"""Shared user profile schemas — matches frontend setup wizard PATCH body."""

from __future__ import annotations

from datetime import date as Date
from typing import Any, Dict, List, Optional

import re

from pydantic import BaseModel, EmailStr, Field, model_validator


class EmergencyContact(BaseModel):
    """Matches frontend ContactCard / ContactModal shape (camelCase keys)."""

    id: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

    model_config = {"extra": "allow"}


class EmergencyContactWrite(EmergencyContact):
    """Validate new PATCH writes while tolerating historical records on read."""
    id: Optional[str] = Field(default=None, max_length=128)
    firstName: Optional[str] = Field(default=None, max_length=100)
    lastName: Optional[str] = Field(default=None, max_length=100)
    phone: str = Field(min_length=7, max_length=40)
    email: Optional[str] = Field(default=None, max_length=254)
    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_contact(self):
        if not any(value and value.strip() for value in (self.firstName, self.lastName)):
            raise ValueError("Contact name is required")
        if not re.fullmatch(r"[+0-9 ().-]+", self.phone) or not 7 <= sum(c.isdigit() for c in self.phone) <= 15:
            raise ValueError("Phone must contain 7 to 15 digits and ordinary phone punctuation")
        return self


_Text = Optional[str]


def _short(max_length: int = 300):
    return Field(default=None, max_length=max_length)


class GreenZone(BaseModel):
    model_config = {"extra": "forbid"}
    daily_medicines: _Text = _short(500)
    # NHLBI plan form's "before exercise" line; shown verbatim on exercise plans (LOB-57)
    before_exercise: _Text = _short(300)


class YellowZone(BaseModel):
    model_config = {"extra": "forbid"}
    quick_relief_medicine: _Text = _short()
    dose_device: _Text = _short()
    repeat_every_minutes: Optional[int] = Field(default=None, ge=1, le=240)
    max_doses: Optional[int] = Field(default=None, ge=1, le=20)
    if_not_improving: _Text = _short(500)


class RedZone(BaseModel):
    model_config = {"extra": "forbid"}
    quick_relief: _Text = _short(500)
    oral_steroid: _Text = _short(300)
    call_clinician: _Text = _short(300)
    emergency: _Text = _short(500)


class ActionPlan(BaseModel):
    """The user's own copy of their clinician-created asthma action plan."""

    model_config = {"extra": "forbid"}
    green: Optional[GreenZone] = None
    yellow: Optional[YellowZone] = None
    red: Optional[RedZone] = None
    other_instructions: _Text = _short(1000)


class PeakFlow(BaseModel):
    model_config = {"extra": "forbid"}
    personal_best: Optional[int] = Field(default=None, ge=50, le=900)
    yellow_below: Optional[int] = Field(default=None, ge=50, le=900)
    red_below: Optional[int] = Field(default=None, ge=50, le=900)


class CareContact(BaseModel):
    model_config = {"extra": "forbid"}
    name: _Text = _short(200)
    phone: _Text = _short(40)
    address: _Text = _short(300)


class AsthmaSupport(BaseModel):
    model_config = {"extra": "forbid"}
    rescue_inhaler: _Text = _short()
    controller_medicines: _Text = _short(500)
    nebulizer: _Text = _short()
    peak_flow: Optional[PeakFlow] = None
    clinician: Optional[CareContact] = None
    urgent_care: Optional[CareContact] = None


class UserProfileFields(BaseModel):
    name: Optional[str] = None
    profile_image_url: Optional[str] = Field(
        default=None,
        max_length=2048,
        description="HTTPS URL for the profile image (e.g. Cloudinary secure_url)",
    )
    date_of_birth: Optional[Date] = None
    emergency_contact: Optional[str] = None
    emergency_contacts: List[EmergencyContact] = Field(default_factory=list)
    preferred_reminder: Optional[str] = None
    contact_method: Optional[str] = None
    preferred_environment: Optional[str] = None
    care_goal: Optional[str] = None
    accessibility_needs: Optional[str] = None
    trigger_preferences: List[str] = Field(default_factory=list)
    trigger_sensitivities: Dict[str, float] = Field(default_factory=dict)
    symptoms: List[str] = Field(default_factory=list)
    tracking: List[str] = Field(default_factory=list)
    action_plan: Optional[ActionPlan] = None
    asthma_support: Optional[AsthmaSupport] = None


class UserProfile(UserProfileFields):
    id: str
    email: EmailStr

    model_config = {"from_attributes": True}


class UserProfileUpdate(UserProfileFields):
    """All fields optional for PATCH."""

    name: Optional[str] = None
    profile_image_url: Optional[str] = Field(default=None, max_length=2048)
    date_of_birth: Optional[Date] = None
    emergency_contact: Optional[str] = None
    emergency_contacts: Optional[List[EmergencyContactWrite]] = None
    preferred_reminder: Optional[str] = None
    contact_method: Optional[str] = None
    preferred_environment: Optional[str] = None
    care_goal: Optional[str] = Field(default=None, max_length=1000)
    accessibility_needs: Optional[str] = Field(default=None, max_length=1000)
    trigger_preferences: Optional[List[str]] = None
    trigger_sensitivities: Optional[Dict[str, float]] = None
    symptoms: Optional[List[str]] = None
    tracking: Optional[List[str]] = None
    action_plan: Optional[ActionPlan] = None
    asthma_support: Optional[AsthmaSupport] = None


def emergency_contacts_to_legacy_string(contacts: list[dict[str, Any]] | None) -> str | None:
    """Build a single-line summary for legacy emergency_contact consumers."""
    if not contacts:
        return None
    parts: list[str] = []
    for contact in contacts:
        name = " ".join(
            p
            for p in (
                contact.get("firstName"),
                contact.get("last_name") or contact.get("lastName"),
            )
            if p
        ).strip()
        phone = contact.get("phone")
        if name and phone:
            parts.append(f"{name} — {phone}")
        elif name:
            parts.append(name)
        elif phone:
            parts.append(str(phone))
    return "; ".join(parts) if parts else None
