"""Authentication routes — register, login, refresh."""

from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.errors import api_error
from api.user_schemas import UserProfileFields
from api.users import apply_profile_fields
from db.database import get_db
from db.models import User
from services.auth_service import create_access_token, hash_password, safe_decode_token, verify_password
from services.auth_email import issue_code, verify_code

logger = logging.getLogger(__name__)


async def _send_code_or_502(email: str, purpose: str) -> None:
    """Send a sign-up/reset code; a failed email is a clear 502, not a crash."""
    try:
        await issue_code(email, purpose)
    except Exception:
        logger.exception("Could not send %s code email", purpose)
        raise api_error(502, "We couldn't send your code right now. Please try again later.", "CODE_EMAIL_FAILED") from None


router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(UserProfileFields):
    email: EmailStr
    password: str = Field(..., min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    access_token: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    code: str = Field(..., min_length=6, max_length=6)


class AuthCodeRequest(BaseModel):
    email: EmailStr


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)


@router.post("/register", status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    existing = db.scalar(select(User).where(User.email == body.email.lower()))
    if existing:
        raise api_error(409, "Email already registered", "EMAIL_EXISTS")

    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
    )
    apply_profile_fields(user, body.model_dump(exclude={"email", "password"}))
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/signup-code")
async def signup_code(body: AuthCodeRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    existing = db.scalar(select(User).where(User.email == body.email.lower()))
    if existing:
        raise api_error(409, "Email already registered", "EMAIL_EXISTS")

    await _send_code_or_502(body.email.lower(), "signup")
    return {"message": "Signup code sent."}


@router.post("/signup-code/verify")
def signup_code_verify(body: VerifyCodeRequest) -> dict[str, bool]:
    if not verify_code(body.email, "signup", body.code, consume=False):
        raise api_error(400, "Invalid or expired code", "INVALID_CODE")
    return {"verified": True}


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise api_error(401, "Invalid email or password", "INVALID_CREDENTIALS")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/reset-code")
async def reset_code(body: AuthCodeRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user:
        raise api_error(404, "User not found", "USER_NOT_FOUND")

    await _send_code_or_502(body.email.lower(), "reset")
    return {"message": "Reset code sent."}


@router.post("/reset-code/verify")
def reset_code_verify(body: VerifyCodeRequest) -> dict[str, bool]:
    if not verify_code(body.email, "reset", body.code, consume=False):
        raise api_error(400, "Invalid or expired code", "INVALID_CODE")
    return {"verified": True}


@router.post("/refresh")
def refresh(
    body: Optional[RefreshRequest] = None,
    db: Session = Depends(get_db),
) -> TokenResponse:
    token = body.access_token if body else None
    if not token:
        raise api_error(401, "Token required for refresh", "UNAUTHORIZED")

    payload = safe_decode_token(token)
    if not payload or "sub" not in payload:
        raise api_error(401, "Invalid or expired token", "UNAUTHORIZED")

    user = db.get(User, uuid.UUID(payload["sub"]))
    if not user:
        raise api_error(404, "User not found", "USER_NOT_FOUND")
    return TokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user:
        raise api_error(404, "User not found", "USER_NOT_FOUND")

    if not verify_code(body.email, "reset", body.code):
        raise api_error(400, "Invalid or expired code", "INVALID_CODE")

    user.password_hash = hash_password(body.password)
    db.add(user)
    db.commit()

    return {"message": "Password updated."}
