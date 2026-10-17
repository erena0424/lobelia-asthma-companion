"""LangChain-compatible model registry with retry and provider fallback."""

from __future__ import annotations

import json
import os
import re
from collections.abc import Callable
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage


class LLMInvocationError(RuntimeError):
    def __init__(self, warnings: list[str]):
        super().__init__("All configured LLM providers failed")
        self.warnings = warnings


class LLMRegistry:
    def __init__(
        self,
        factories: dict[str, Callable[[], Any]] | None = None,
        *,
        retries_per_provider: int = 1,
    ):
        self.factories = factories or {}
        self.retries_per_provider = max(1, retries_per_provider)

    async def generate(
        self,
        *,
        system_prompt: str,
        prompt: str,
        requested_provider: str | None = None,
        validator: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    ) -> tuple[dict[str, Any], str, list[str]]:
        warnings: list[str] = []
        for provider in self.provider_order(requested_provider):
            for attempt in range(self.retries_per_provider):
                try:
                    model = self._model(provider)
                    response = await model.ainvoke(
                        [
                            SystemMessage(content=system_prompt),
                            HumanMessage(content=prompt),
                        ]
                    )
                    parsed = parse_json_response(_response_text(response))
                    if validator is not None:
                        parsed = validator(parsed)
                    return parsed, provider, warnings
                except Exception:
                    warnings.append(
                        f"{provider} attempt {attempt + 1} failed; "
                        + ("retrying." if attempt + 1 < self.retries_per_provider else "trying fallback.")
                    )
        raise LLMInvocationError(warnings)

    @staticmethod
    def provider_order(requested_provider: str | None = None) -> list[str]:
        primary = (requested_provider or os.getenv("LLM_PROVIDER", "gemini")).strip().lower()
        fallback = os.getenv("LLM_FALLBACK_PROVIDER", "claude").strip().lower()
        allowed = {"gemini", "claude"}
        if primary not in allowed:
            raise ValueError(f"Unsupported LLM provider: {primary}")
        order = [primary]
        if fallback in allowed and fallback not in order:
            order.append(fallback)
        for provider in ("gemini", "claude"):
            if provider not in order:
                order.append(provider)
        return order

    def _model(self, provider: str) -> Any:
        if provider in self.factories:
            return self.factories[provider]()
        if provider == "gemini":
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY is not set")
            from langchain_google_genai import ChatGoogleGenerativeAI

            return ChatGoogleGenerativeAI(
                model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
                google_api_key=api_key,
                temperature=0,
                timeout=float(os.getenv("LLM_TIMEOUT_SECONDS", "45")),
                max_retries=1,
            )
        if provider == "claude":
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY is not set")
            from langchain_anthropic import ChatAnthropic

            return ChatAnthropic(
                model=os.getenv("CLAUDE_MODEL", "claude-3-5-haiku-latest"),
                api_key=api_key,
                temperature=0,
                max_tokens=1024,
                timeout=float(os.getenv("LLM_TIMEOUT_SECONDS", "45")),
                max_retries=1,
            )
        raise ValueError(f"Unsupported LLM provider: {provider}")


def _response_text(response: Any) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        return json.dumps(content)
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "".join(parts)
    return str(content)


def strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def repair_json(text: str) -> str:
    return re.sub(r",(\s*[}\]])", r"\1", text)


def parse_json_response(text: str) -> dict[str, Any]:
    stripped = strip_code_fence(text)
    candidates = [stripped]
    match = re.search(r"\{.*\}", stripped, re.DOTALL)
    if match and match.group(0) != stripped:
        candidates.append(match.group(0))

    last_error: json.JSONDecodeError | None = None
    for candidate in candidates:
        for variant in (candidate, repair_json(candidate)):
            try:
                parsed = json.loads(variant)
                if not isinstance(parsed, dict):
                    raise json.JSONDecodeError("Expected JSON object", variant, 0)
                return parsed
            except json.JSONDecodeError as exc:
                last_error = exc
    if last_error is None:
        raise json.JSONDecodeError("No JSON object found", text, 0)
    raise last_error
