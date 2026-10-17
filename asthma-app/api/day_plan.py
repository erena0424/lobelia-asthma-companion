"""Advice through the day: morning summary + one tip per timed event (in-app only)."""

from __future__ import annotations

from datetime import date as Date
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.deps import get_current_user
from db.database import get_db
from db.models import User
from services.day_plan_service import build_day_plan

router = APIRouter(tags=["day-plan"])


class DayPlanRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    date: Optional[Date] = None
    timezone: str = Field("America/Chicago", max_length=64, description="IANA timezone of the browser")


@router.post("/day-plan")
async def get_day_plan(
    body: DayPlanRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return await build_day_plan(
        db,
        user,
        lat=body.lat,
        lon=body.lon,
        day=body.date,
        timezone_name=body.timezone,
    )
