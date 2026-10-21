"""SQLAlchemy models for Mirror Lake product APIs."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.database import Base

EMBEDDING_DIM = 768


class InhalerEventType(str, enum.Enum):
    puff = "puff"
    manual_override = "manual_override"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    profile_image_url: Mapped[Optional[str]] = mapped_column(String(2048))
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date)
    emergency_contact: Mapped[Optional[str]] = mapped_column(Text)
    emergency_contacts: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    support_memory: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Written by the user from their clinician's plan; never generated or sent to the LLM.
    action_plan: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    asthma_support: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    preferred_reminder: Mapped[Optional[str]] = mapped_column(String(16))
    contact_method: Mapped[Optional[str]] = mapped_column(String(32))
    preferred_environment: Mapped[Optional[str]] = mapped_column(String(64))
    care_goal: Mapped[Optional[str]] = mapped_column(Text)
    accessibility_needs: Mapped[Optional[str]] = mapped_column(Text)
    trigger_preferences: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    trigger_sensitivities: Mapped[dict] = mapped_column(JSONB, default=dict)
    symptoms: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    tracking: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    google_calendar_refresh_token: Mapped[Optional[str]] = mapped_column(Text)
    google_calendar_email: Mapped[Optional[str]] = mapped_column(String(255))
    google_calendar_connected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    check_ins: Mapped[list["CheckIn"]] = relationship(back_populates="user")
    wearables: Mapped[list["WearableDaily"]] = relationship(back_populates="user")


class CheckIn(Base):
    __tablename__ = "check_ins"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_check_ins_user_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    daily_day_symp: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    daily_night_symp: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    daily_limit_activity: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    symptoms_logged: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    puffs_today: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    triggers: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    calendar_event: Mapped[Optional[str]] = mapped_column(Text)
    calendar_events: Mapped[Optional[list]] = mapped_column(JSONB)
    # mood, 0-10 breathing scores and context chips from the detailed check-in
    details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="check_ins")
    inhaler_events: Mapped[list["InhalerEvent"]] = relationship(back_populates="check_in")


class SymptomLog(Base):
    """A quick "right now" log: symptoms at one moment, many per day (feeds the Day check-in pre-fill)."""

    __tablename__ = "symptom_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # the person's calendar day, so a late-evening log lands on the right Day check-in
    local_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # same 0-10 scales as the Day check-in's sliders
    breathing: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    limiting_activity: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    reliever_puffs: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    triggers: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class InhalerEvent(Base):
    __tablename__ = "inhaler_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    check_in_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("check_ins.id"), nullable=False)
    event_type: Mapped[InhalerEventType] = mapped_column(Enum(InhalerEventType), nullable=False)
    puffs_delta: Mapped[int] = mapped_column(Integer, default=0)
    puffs_total_after: Mapped[int] = mapped_column(Integer, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    check_in: Mapped["CheckIn"] = relationship(back_populates="inhaler_events")


class WearableDaily(Base):
    __tablename__ = "wearables_daily"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_wearables_user_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    sleep_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    total_steps: Mapped[Optional[int]] = mapped_column(Integer)
    sedentary_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    running_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    avg_hr: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="wearables")


class EnvSnapshot(Base):
    __tablename__ = "env_snapshots"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_env_snapshots_user_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    features: Mapped[dict] = mapped_column(JSONB, nullable=False)
    missing: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Forecast(Base):
    __tablename__ = "forecasts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    forecast_for: Mapped[date] = mapped_column(Date, nullable=False)
    flare_probability: Mapped[Optional[float]] = mapped_column(Float)
    risk_level: Mapped[Optional[str]] = mapped_column(String(16))
    contributing_factors: Mapped[Optional[list]] = mapped_column(JSONB)
    advice: Mapped[Optional[dict]] = mapped_column(JSONB)
    calendar_events: Mapped[Optional[list]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Episode(Base):
    """Retrospective asthma situation memory for hybrid (vector + keyword) retrieval.

    Calendar events stay in check_ins; this table stores derived episode summaries
    and embeddings — never raw calendar rows.
    """

    __tablename__ = "episodes"
    __table_args__ = (UniqueConstraint("user_id", "episode_date", name="uq_episodes_user_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    episode_date: Mapped[date] = mapped_column(Date, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="retrospective")
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    search_tsv: Mapped[Optional[str]] = mapped_column(TSVECTOR)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBEDDING_DIM))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
