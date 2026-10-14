"""Send risk scores to Claude and return plain-English advice."""

import os
from pathlib import Path

from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

SYSTEM_PROMPT = (
    "You are an asthma care assistant. You receive structured risk "
    "assessment data and explain it to the patient in 2-3 sentences. "
    "Be warm, clear, and actionable. Never say 'consult a doctor' "
    "as the only advice."
)

MODEL = "claude-3-5-haiku-latest"


def _build_user_message(risk_dict: dict) -> str:
    inputs = risk_dict.get("inputs", {})
    lines = [
        f"Prediction mode: {risk_dict.get('prediction_mode', 'unknown')}",
        f"Risk level: {risk_dict.get('risk_level')}",
    ]

    if risk_dict.get("flare_probability") is not None:
        lines.append(f"Tomorrow flare probability: {risk_dict['flare_probability']:.0%}")

    if risk_dict.get("top_features"):
        lines.append(f"Top contributing features: {', '.join(risk_dict['top_features'])}")

    if risk_dict.get("triggered_rules"):
        lines.append(f"Triggered rules: {', '.join(risk_dict['triggered_rules'])}")

    if risk_dict.get("cold_start"):
        lines.append("Note: cold-start user (limited personal baseline history).")

    for key in ("temp_change", "aqi", "humidity", "pollen_level", "cough_today", "inhaler_today"):
        if key in inputs:
            lines.append(f"{key}: {inputs[key]}")

    if "night_symp" in inputs:
        lines.append(f"Nighttime symptoms: {inputs.get('night_symp')}")

    pef_am = inputs.get("pef_am")
    pef_personal_best = inputs.get("pef_personal_best", 0)
    if pef_personal_best and pef_personal_best > 0 and pef_am is not None:
        lines.append(f"PEF ratio: {pef_am / pef_personal_best:.0%}")

    return "\n".join(lines)


async def interpret_risk(risk_dict: dict) -> str:
    """Translate risk engine or ML output into personalized plain-English advice."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY is not set")

    from anthropic import AsyncAnthropic  # deferred: slow import, only needed here

    client = AsyncAnthropic(api_key=api_key)
    message = await client.messages.create(
        model=MODEL,
        max_tokens=256,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": _build_user_message(risk_dict)}],
    )

    return message.content[0].text
