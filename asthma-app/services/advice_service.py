"""RAG advice pipeline — static KB + Layer 3 + Claude/Gemini."""

from __future__ import annotations

import json
import os
import re
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy.orm import Session

from copilot.providers import (
    CalendarProvider,
    ManualCalendarProvider,
    StructuredCalendarProvider,
)
from copilot.state import AdviceType
from db.models import User

load_dotenv()

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "knowledge"
DEFAULT_DISCLAIMER = (
    "This information is for educational purposes only and is not a medical diagnosis. "
    "Follow your clinician's asthma action plan."
)

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-3-5-haiku-latest")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")


def _load_chunks(filename: str) -> list[dict]:
    path = KNOWLEDGE_DIR / filename
    if not path.exists():
        return []
    return json.loads(path.read_text())


def _select_chunks(chunks: list[dict], contributing_factors: list[str], limit: int = 2) -> list[dict]:
    if not chunks:
        return []
    tags_from_factors: set[str] = set()
    for factor in contributing_factors:
        for token in re.findall(r"[a-zA-Z]+", factor.lower()):
            tags_from_factors.add(token)
        tags_from_factors.add(factor.lower().replace(" ", "_"))

    scored: list[tuple[int, dict]] = []
    for chunk in chunks:
        chunk_tags = {t.lower() for t in chunk.get("tags", [])}
        score = len(chunk_tags & tags_from_factors)
        if score == 0 and chunk_tags:
            score = 1 if any(t in factor.lower() for factor in contributing_factors for t in chunk_tags) else 0
        if score > 0:
            scored.append((score, chunk))
    scored.sort(key=lambda x: x[0], reverse=True)
    if not scored:
        return chunks[:limit]
    return [c for _, c in scored[:limit]]


def _build_prompt(
    *,
    risk_level: str,
    contributing_factors: list[str],
    calendar_event: str | None,
    calendar_events: list[dict] | None,
    symptoms_summary: str,
    puffs_today: int,
    layer1: list[dict],
    layer2: list[dict],
    layer3_summary: str,
) -> str:
    from services.google_calendar import format_events_for_prompt

    l1_text = "\n\n".join(f"[Layer 1 — {c['title']}]\n{c['body']}" for c in layer1)
    l2_text = "\n\n".join(f"[Layer 2 — {c['title']}]\n{c['body']}" for c in layer2)
    events_block = format_events_for_prompt(calendar_events)
    return f"""You are an asthma management assistant.

User context:
- Risk level: {risk_level}
- Contributing factors: {", ".join(contributing_factors) if contributing_factors else "none"}
- Calendar summary: {calendar_event or "none"}
- Tomorrow's calendar events (structured — use these for activity-specific advice):
{events_block}
- Symptoms today: {symptoms_summary}
- Rescue inhaler today: {puffs_today} puffs

Retrieved knowledge:
{l1_text}

{l2_text}

{layer3_summary}

Task: Explain possible causes and provide recommendations tailored to tomorrow's scheduled activities
(outdoor vs indoor, timing, location). Do not provide a medical diagnosis.
Return ONLY valid JSON with keys: summary (string), sections (array of {{title, body}}), disclaimer (string).
Use 2-3 sections with practical before/during/after activity guidance when relevant."""


async def _call_claude(prompt: str) -> dict:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY is not set")
    from anthropic import AsyncAnthropic  # deferred: slow import, only needed here

    client = AsyncAnthropic(api_key=api_key)
    message = await client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    text = message.content[0].text
    return _parse_json_response(text)


async def _call_gemini(prompt: str) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set")
    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise ValueError("google-generativeai package is required for Gemini") from exc

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(GEMINI_MODEL)
    last_error: Exception | None = None
    for attempt in range(2):
        response = await model.generate_content_async(
            prompt,
            generation_config={"response_mime_type": "application/json"},
        )
        try:
            return _parse_json_response(response.text)
        except json.JSONDecodeError as exc:
            last_error = exc
            if attempt == 0:
                continue
    assert last_error is not None
    raise last_error


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _repair_json(text: str) -> str:
    """Fix common LLM JSON mistakes (trailing commas)."""
    return re.sub(r",(\s*[}\]])", r"\1", text)


def _json_candidates(text: str) -> list[str]:
    text = _strip_code_fence(text)
    candidates = [text]
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match and match.group(0) != text:
        candidates.append(match.group(0))
    return candidates


def _parse_json_response(text: str) -> dict:
    last_error: json.JSONDecodeError | None = None
    for candidate in _json_candidates(text):
        for variant in (candidate, _repair_json(candidate)):
            try:
                data = json.loads(variant)
                if not isinstance(data, dict):
                    raise json.JSONDecodeError("Expected JSON object", variant, 0)
                data.setdefault("disclaimer", DEFAULT_DISCLAIMER)
                return data
            except json.JSONDecodeError as exc:
                last_error = exc
    assert last_error is not None
    raise last_error


async def generate_advice(
    *,
    risk_level: str,
    contributing_factors: list[str],
    calendar_event: str | None,
    symptoms_summary: str,
    puffs_today: int,
    layer3_summary: str,
    llm_provider: str | None = None,
    calendar_events: list[dict] | None = None,
    db: Session | None = None,
    user: User | None = None,
    anchor_date: date | None = None,
    forecast: dict[str, Any] | None = None,
    environment: dict[str, Any] | None = None,
    question: str | None = None,
    advice_type: AdviceType = "daily",
    calendar_provider: CalendarProvider | None = None,
    return_warnings: bool = False,
) -> dict | None | tuple[dict | None, list[str]] | tuple[dict | None, list[str], dict | None]:
    if db is not None and user is not None and anchor_date is not None:
        from copilot.workflow import generate_copilot_advice

        # Advice targets tomorrow's forecast day — match the calendar window.
        calendar_day = anchor_date + timedelta(days=1)
        resolved_calendar = calendar_provider
        if resolved_calendar is None and calendar_events:
            # Forecast/advice already resolved Google / manual / request events.
            default_source = "google_calendar"
            if calendar_events and isinstance(calendar_events[0], dict):
                default_source = str(calendar_events[0].get("source") or "google_calendar")
            resolved_calendar = StructuredCalendarProvider(
                calendar_events,
                default_source=default_source,
                pre_scoped=True,
            )
        elif resolved_calendar is None and calendar_event:
            resolved_calendar = ManualCalendarProvider(calendar_event, calendar_day)

        advice, warnings, debug = await generate_copilot_advice(
            db=db,
            user=user,
            anchor_date=anchor_date,
            forecast=forecast
            or {
                "risk_level": risk_level,
                "contributing_factors": contributing_factors,
            },
            environment=environment or {},
            symptoms_summary=symptoms_summary,
            puffs_today=puffs_today,
            question=question,
            requested_provider=llm_provider,
            advice_type=advice_type,
            calendar_provider=resolved_calendar,
            calendar_day=calendar_day,
        )
        if return_warnings:
            return advice, warnings, debug
        if advice is None:
            raise RuntimeError("LLM provider error")
        return advice

    provider = (llm_provider or os.getenv("LLM_PROVIDER", "gemini")).lower()
    layer1 = _select_chunks(_load_chunks("layer1.json"), contributing_factors)
    layer2 = _select_chunks(_load_chunks("layer2.json"), contributing_factors)

    prompt = _build_prompt(
        risk_level=risk_level,
        contributing_factors=contributing_factors,
        calendar_event=calendar_event,
        calendar_events=calendar_events,
        symptoms_summary=symptoms_summary,
        puffs_today=puffs_today,
        layer1=layer1,
        layer2=layer2,
        layer3_summary=layer3_summary,
    )

    try:
        if provider == "gemini":
            parsed = await _call_gemini(prompt)
        else:
            parsed = await _call_claude(prompt)
    except Exception as exc:
        raise RuntimeError("LLM provider error") from exc

    sources = ["local_knowledge"]
    if "Personalized Patient History" in layer3_summary:
        sources.append("user_history")
    if calendar_events:
        sources.append("google_calendar")

    payload = {
        "summary": parsed.get("summary", ""),
        "sections": parsed.get("sections", []),
        "disclaimer": parsed.get("disclaimer", DEFAULT_DISCLAIMER),
        "llm_provider": provider,
        "knowledge_sources_used": sources,
    }
    if return_warnings:
        return payload, [], None
    return payload
