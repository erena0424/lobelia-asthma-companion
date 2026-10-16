"""GET /v1/insights: trend, 4-week comparison and possible patterns from the user's own check-ins."""

from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.deps import get_current_user
from api.errors import api_error
from db.database import get_db
from db.models import User
from services.insights_service import build_insights

router = APIRouter(tags=["insights"])
RANGES = {28, 90, 180, 365}


@router.get("/insights")
def get_insights(
    days: int = Query(28, description="Trend range in days: 28, 90, 180 or 365"),
    today: Optional[date] = Query(None, description="The user's local date; defaults to the server's"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if days not in RANGES:
        raise api_error(400, "days must be 28, 90, 180 or 365", "INVALID_RANGE")
    return build_insights(db, user.id, today or date.today(), days)
