"""In-app feedback -> email to the support inbox (support@lobelia.app by default)."""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr, Field, field_validator

from api.deps import get_optional_user
from api.errors import api_error
from db.models import User
from services.feedback_service import FeedbackRateLimited, build_email, check_rate_limit, send_feedback

router = APIRouter(tags=["feedback"])


class FeedbackRequest(BaseModel):
    model_config = {"extra": "forbid"}

    message: str = Field(..., min_length=1, max_length=5000)
    category: Literal["idea", "bug", "other"] = "other"
    allow_reply: bool = False
    email: Optional[EmailStr] = Field(None, description="Reply address for signed-out users")
    page: Optional[str] = Field(None, max_length=200)
    app_version: Optional[str] = Field(None, max_length=50)

    @field_validator("message")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Message cannot be blank")
        return value.strip()


@router.post("/feedback", status_code=202)
async def submit_feedback(
    body: FeedbackRequest,
    request: Request,
    user: Optional[User] = Depends(get_optional_user),
) -> dict:
    client_ip = request.client.host if request.client else "unknown"
    try:
        check_rate_limit(f"user:{user.id}" if user else f"ip:{client_ip}")
    except FeedbackRateLimited:
        raise api_error(429, "Too much feedback in a short time. Please try again later.", "RATE_LIMITED") from None

    reply_email = user.email if user else (str(body.email) if body.email else None)
    payload = build_email(
        message=body.message,
        category=body.category,
        user_email=reply_email,
        user_id=str(user.id) if user else None,
        allow_reply=body.allow_reply,
        page=body.page,
        app_version=body.app_version,
        user_agent=request.headers.get("user-agent", "")[:300],
    )
    try:
        await send_feedback(payload)
    except Exception as exc:
        raise api_error(502, "We couldn't send your feedback right now.", "FEEDBACK_SEND_FAILED") from exc

    return {"status": "sent"}
