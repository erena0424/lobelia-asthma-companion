"""Medication-safety regexes shared by the advice workflow and the day plan.

Kept in a dependency-free module so importers (e.g. services.day_plan_service) do not
load langgraph via copilot.workflow at API startup.
"""

from __future__ import annotations

import re

_MEDICATION_CHANGE_PATTERN = re.compile(
    r"\b(start|stop|switch|increase|decrease|reduce|raise|lower|double|adjust|change|skip)\b"
    r".{0,80}\b(dose|dosage|medication|medicine|inhaler|controller|reliever|puffs?|frequency)\b"
    r"|"
    r"\b(dose|dosage|medication|medicine|inhaler|controller|reliever|frequency)\b"
    r".{0,80}\b(start|stop|switch|increase|decrease|reduce|raise|lower|double|adjust|change|skip)\b",
    re.IGNORECASE,
)
# Instructions to take/use medicine are never generated: Lobelia hasn't verified the
# user's prescription, so medication steps come only from their saved clinician plan.
_MEDICATION_INSTRUCTION_PATTERN = re.compile(
    r"\b(take|taking|use|using|inhale|remember)\b.{0,40}"
    r"\b(controller|preventer|medication|medicine|meds|steroids?|inhalers?|nebuli[sz]er|tablets?|pills?|doses?)\b",
    re.IGNORECASE,
)
_NUMERIC_DOSAGE_PATTERN = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|micrograms?|milligrams?|puffs?|tablets?|doses?)\b",
    re.IGNORECASE,
)
