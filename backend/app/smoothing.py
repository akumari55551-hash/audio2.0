from __future__ import annotations

from collections.abc import Sequence
from typing import Any


def smooth_predictions(predictions: Sequence[dict[str, Any]], window: int) -> dict[str, Any]:
    """Return a rolling majority judgment while preserving the latest confidence."""
    if not predictions:
        return {"status": "unavailable", "label": "No detection available", "confidence": None, "risk": None}

    latest = predictions[-1]
    statuses = [prediction["status"] for prediction in predictions[-window:]]
    status = "spoof" if statuses.count("spoof") >= statuses.count("human") else "human"
    confidence = round(sum(float(prediction["confidence"] or 0.0) for prediction in predictions[-window:]) / len(predictions[-window:]), 1)
    risk = "high" if status == "spoof" and any(prediction.get("risk") == "high" for prediction in predictions[-window:]) else latest.get("risk", "unknown")
    return {
        "status": status,
        "label": latest.get("label", "AASIST temporal result"),
        "confidence": confidence,
        "risk": risk,
    }
