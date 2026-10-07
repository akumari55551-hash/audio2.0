from __future__ import annotations

from dataclasses import replace
from pathlib import Path

from app.config import settings
from app.model_loader import AASISTModelLoader


def test_official_aasist_checkpoint_loads_with_exact_architecture() -> None:
    checkpoint_path = Path(__file__).resolve().parents[2] / "models" / "aasist" / "models" / "weights" / "AASIST.pth"
    settings_with_checkpoint = replace(settings, model_path=checkpoint_path)

    runtime = AASISTModelLoader(settings_with_checkpoint).load()

    assert runtime.model_loaded is True
    assert runtime.error is None
    assert runtime.model is not None
    assert runtime.model.__class__.__name__ == "Model"
    assert runtime.model.out_layer.out_features == 2
    assert runtime.checkpoint_sha256 is not None
