from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    project_root: Path
    model_path: Path
    model_name: str
    sample_rate: int
    input_samples: int
    max_upload_bytes: int
    confidence_threshold: float
    spoof_threshold: float
    high_risk_threshold: float
    smoothing_window: int
    backend_url: str
    database_path: Path

    @classmethod
    def from_env(cls) -> "Settings":
        root = Path(os.getenv("PROJECT_ROOT", Path(__file__).resolve().parents[2]))
        model_path = Path(os.getenv("AASIST_CHECKPOINT", root / "models" / "aasist" / "models" / "weights" / "AASIST.pth"))
        return cls(
            project_root=root,
            model_path=model_path,
            model_name=os.getenv("AASIST_MODEL_NAME", "AASIST"),
            sample_rate=int(os.getenv("AASIST_SAMPLE_RATE", "16000")),
            input_samples=int(os.getenv("AASIST_INPUT_SAMPLES", "64600")),
            max_upload_bytes=int(os.getenv("MAX_UPLOAD_BYTES", str(25 * 1024 * 1024))),
            confidence_threshold=float(os.getenv("CONFIDENCE_THRESHOLD", "0.60")),
            spoof_threshold=float(os.getenv("SPOOF_THRESHOLD", "0.55")),
            high_risk_threshold=float(os.getenv("HIGH_RISK_THRESHOLD", "0.75")),
            smoothing_window=max(1, int(os.getenv("TEMPORAL_SMOOTHING_WINDOW", "5"))),
            backend_url=os.getenv("BACKEND_URL", "http://127.0.0.1:8000"),
            database_path=Path(os.getenv("HISTORY_DB", root / "backend" / "audiodb.sqlite3")),
        )


settings = Settings.from_env()
