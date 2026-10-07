from __future__ import annotations

from pathlib import Path
import sys

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.preprocess import validate_and_prepare
from app.risk import assess_risk
from app.smoothing import smooth_predictions


def test_validate_and_prepare_preserves_official_wav_scale_and_length(tmp_path: Path) -> None:
    path = tmp_path / "sample.wav"
    samples = np.sin(2 * np.pi * 220 * np.arange(16000) / 16000).astype(np.float32)
    sf.write(path, samples, 16000)

    prepared = validate_and_prepare(path)

    assert prepared.metadata.sample_rate == 16000
    assert prepared.metadata.samples == 64600
    assert prepared.tensor.shape == (64600,)
    assert prepared.tensor[0] == pytest.approx(samples[0])
    assert prepared.tensor.max() <= 1.0


def test_assess_risk_uses_configured_security_thresholds() -> None:
    assert assess_risk(0.90, 0.90).level == "high"
    assert assess_risk(0.60, 0.60).level == "medium"
    assert assess_risk(0.20, 0.90).level == "low"


def test_smooth_predictions_returns_majority_and_preserves_uncertain_result() -> None:
    predictions = [
        {"status": "human", "label": "Likely Genuine Human Speech", "confidence": 90.0, "risk": "low"},
        {"status": "human", "label": "Likely Genuine Human Speech", "confidence": 88.0, "risk": "low"},
        {"status": "spoof", "label": "Potential AI-Generated Voice", "confidence": 72.0, "risk": "medium"},
    ]

    smoothed = smooth_predictions(predictions, window=2)

    assert smoothed["status"] == "spoof"
    assert smoothed["confidence"] == 80.0
    assert smoothed["risk"] == "medium"


def test_official_protocol_maps_bonafide_to_one_and_spoof_to_zero(tmp_path: Path) -> None:
    from models.aasist.data_utils import genSpoof_list

    protocol = tmp_path / "protocol.txt"
    protocol.write_text(
        "ASVspoof2019.LA.trial bonafide.wav 0 0 bonafide\n"
        "ASVspoof2019.LA.trial spoof.wav 0 0 spoof\n",
        encoding="utf-8",
    )

    labels, files = genSpoof_list(protocol, is_train=False)

    assert labels == {"bonafide.wav": 1, "spoof.wav": 0}
    assert files == ["bonafide.wav", "spoof.wav"]
