from __future__ import annotations

from dataclasses import dataclass

from .config import settings


@dataclass(frozen=True)
class RiskAssessment:
    level: str
    explanation: str
    spoof_score: float
    confidence: float


def assess_risk(spoof_score: float, confidence: float) -> RiskAssessment:
    if spoof_score >= settings.high_risk_threshold:
        level = "high"
        explanation = "Strong spoof-class evidence is present in the model output. Treat the result as an AI-assisted security warning."
    elif spoof_score >= settings.spoof_threshold or confidence < settings.confidence_threshold:
        level = "medium"
        explanation = "The model output is moderate or uncertain. Use additional verification before making a security decision."
    else:
        level = "low"
        explanation = "The model output supports a genuine-speech classification, but it is not proof of identity."
    return RiskAssessment(level, explanation, spoof_score, confidence)
