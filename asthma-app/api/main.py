from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from api.advice import router as advice_router
from api.auth import router as auth_router
from api.calendar import router as calendar_router
from api.chat import router as chat_router
from api.companion import router as companion_router
from api.day_plan import router as day_plan_router
from api.check_ins import router as check_ins_router
from api.env import EnvDailyResponse, get_env_daily
from api.errors import APIError, api_error_handler, validation_exception_handler
from api.forecast import router as forecast_router
from api.interpreter import interpret_risk
from api.predict import PatientInput, health_status, run_classifier_prediction, run_prediction
from api.schemas import ClassifierInput
from api.users import router as users_router
from api.wearables import router as wearables_router
from db.database import database_reachable

load_dotenv()

_DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173,"
    "http://127.0.0.1:5173,"
    "http://127.0.0.1:8000"
)


def _cors_origins() -> list[str]:
    """Browser origins allowed to call this API (comma-separated CORS_ORIGINS)."""
    raw = os.getenv("CORS_ORIGINS", _DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Schema changes are applied with Alembic (`alembic upgrade head`), not create_all.
    if not database_reachable():
        print(
            "Warning: database unreachable. DB routes will error until PostgreSQL is available. "
            "Run: docker compose up -d postgres && alembic upgrade head"
        )
    yield


app = FastAPI(
    title="Asthma Flare-up Prediction API",
    description=(
        "Predict tomorrow's asthma flare-up. "
        "POST /predict/classifier uses the trained XGBoost model (strategy 2: "
        "nullable sensor fields map to NaN, not zero; no peak flow). "
        "POST /predict is GINA cold-start for new users. "
        "Product APIs live under /v1."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    # LAN phone/tablet Vite origins (http://192.168.x.x:5173) during local QA.
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(APIError, api_error_handler)


app.add_exception_handler(RequestValidationError, validation_exception_handler)


@app.get("/health")
async def health() -> dict:
    return health_status()


@app.get("/v1/env/daily", response_model=EnvDailyResponse)
async def env_daily(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    day: Optional[str] = Query(None, alias="date"),
    provider: Optional[str] = Query(None, description="openmeteo (free) or openweather"),
) -> EnvDailyResponse:
    from datetime import date as date_cls

    parsed_day = date_cls.fromisoformat(day) if day else None
    return await get_env_daily(lat=lat, lon=lon, day=parsed_day, provider=provider)


app.include_router(auth_router, prefix="/v1")
app.include_router(users_router, prefix="/v1")
app.include_router(check_ins_router, prefix="/v1")
app.include_router(wearables_router, prefix="/v1")
app.include_router(calendar_router, prefix="/v1")
app.include_router(forecast_router, prefix="/v1")
app.include_router(advice_router, prefix="/v1")
app.include_router(chat_router, prefix="/v1")
app.include_router(companion_router, prefix="/v1")
app.include_router(day_plan_router, prefix="/v1")


@app.post("/predict/classifier")
async def predict_classifier_endpoint(
    inputs: ClassifierInput,
    include_advice: bool = Query(False, description="Add Claude plain-English advice (needs ANTHROPIC_API_KEY)"),
) -> dict:
    try:
        result = run_classifier_prediction(inputs)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if include_advice:
        try:
            result["advice"] = await interpret_risk(result)
        except ValueError as exc:
            result["advice"] = None
            result["advice_error"] = str(exc)

    return result


@app.post("/predict")
async def predict(
    inputs: PatientInput,
    include_advice: bool = Query(False, description="Add Claude plain-English advice (needs ANTHROPIC_API_KEY)"),
) -> dict:
    result = run_prediction(inputs)

    if include_advice:
        try:
            result["advice"] = await interpret_risk(result)
        except ValueError as exc:
            result["advice"] = None
            result["advice_error"] = str(exc)

    return result
