from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any

import torch

from .config import settings
from .logging import logger
from .model_loader import AASISTModelLoader
from .preprocess import PreparedAudio


@dataclass(frozen=True)
class Prediction:
    status: str
    label: str
    confidence: float | None
    risk: str | None
    model: str
    processing_ms: int
    model_output: str
    score: float | None
    raw_logits: list[float] | None = None
    probabilities: list[float] | None = None


def detect_audio(audio: PreparedAudio, runtime: object) -> dict[str, Any]:
    """Run the official AASIST model and return its raw class outputs."""
    started = perf_counter()
    if runtime is None or not runtime.model_loaded or runtime.model is None:
        return {
            "prediction": "unavailable",
            "confidence": None,
            "risk": None,
            "raw_logits": None,
            "probabilities": None,
            "model": settings.model_name,
            "processing_ms": 0,
            "status": "unavailable",
            "label": "DETECTION UNAVAILABLE",
            "model_output": "model_not_loaded",
            "score": None,
        }

    try:
        logger.info("INFERENCE Processing audio: samples=%d rate=%d", audio.tensor.size, audio.metadata.sample_rate)
        with torch.inference_mode():
            tensor = torch.from_numpy(audio.tensor).unsqueeze(0).to(runtime.device)
            _, logits = runtime.model(tensor)
            class_logits = logits[0].detach().cpu().tolist()
            probabilities = torch.softmax(logits, dim=1)[0].detach().cpu().tolist()

        class_0_probability = float(probabilities[0])
        class_1_probability = float(probabilities[1])
        spoof_probability = class_0_probability
        human_probability = class_1_probability
        confidence = max(class_0_probability, class_1_probability)
        if spoof_probability >= settings.spoof_threshold:
            prediction = "spoof"
            label = "Potential AI-Generated Voice"
            model_output = "class_0_spoof"
        else:
            prediction = "human"
            label = "Likely Genuine Human Speech"
            model_output = "class_1_bonafide"
        risk = classify_risk(spoof_probability, confidence)
        logger.info(
            "INFERENCE Prediction completed: status=%s confidence=%.4f spoof_probability=%.4f risk=%s",
            prediction,
            confidence,
            spoof_probability,
            risk,
        )
        return {
            "prediction": prediction,
            "confidence": round(confidence * 100, 1),
            "risk": risk,
            "raw_logits": class_logits,
            "probabilities": probabilities,
            "model": settings.model_name,
            "processing_ms": round((perf_counter() - started) * 1000),
            "status": prediction,
            "label": label,
            "model_output": model_output,
            "score": spoof_probability,
            "class_0_probability": class_0_probability,
            "class_1_probability": class_1_probability,
        }
    except Exception as exc:
        logger.error("INFERENCE Failed: %s", exc)
        return {
            "prediction": "unavailable",
            "confidence": None,
            "risk": None,
            "raw_logits": None,
            "probabilities": None,
            "model": settings.model_name,
            "processing_ms": round((perf_counter() - started) * 1000),
            "status": "unavailable",
            "label": "DETECTION UNAVAILABLE",
            "model_output": "inference_failed",
            "score": None,
        }


def run_inference(audio: PreparedAudio, runtime: object) -> Prediction:
    result = detect_audio(audio, runtime)
    return Prediction(
        status=result["status"],
        label=result["label"],
        confidence=result["confidence"],
        risk=result["risk"],
        model=result["model"],
        processing_ms=result["processing_ms"],
        model_output=result["model_output"],
        score=result["score"],
        raw_logits=result["raw_logits"],
        probabilities=result["probabilities"],
    )


def classify_risk(spoof_score: float, confidence: float) -> str:
    if spoof_score >= settings.high_risk_threshold:
        return "high"
    if spoof_score >= settings.spoof_threshold or confidence < settings.confidence_threshold:
        return "medium"
    return "low"


def create_runtime_loader() -> AASISTModelLoader:
    return AASISTModelLoader(settings)
