from __future__ import annotations

import importlib.util
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch

from .config import settings
from .logging import logger


class ModelLoadError(RuntimeError):
    pass


@dataclass
class ModelRuntime:
    model: torch.nn.Module
    device: torch.device
    model_loaded: bool
    error: str | None
    checkpoint_sha256: str | None


class AASISTModelLoader:
    def __init__(self, settings_obj: Any = settings) -> None:
        self.settings = settings_obj
        self.runtime: ModelRuntime | None = None
        self._model = None

    def load(self) -> ModelRuntime:
        if not self.settings.model_path.is_file():
            error = "Checkpoint not found"
            logger.error("MODEL LOADER %s", error)
            self.runtime = ModelRuntime(None, torch.device("cpu"), False, error, None)
            return self.runtime
        try:
            checkpoint = torch.load(self.settings.model_path, map_location="cpu", weights_only=False)
            if isinstance(checkpoint, dict) and "model_config" in checkpoint:
                config = checkpoint["model_config"]
                state_dict = checkpoint.get("state_dict", checkpoint.get("model_state_dict"))
            elif isinstance(checkpoint, dict) and "state_dict" in checkpoint:
                config = self._load_config()
                state_dict = checkpoint["state_dict"]
            elif isinstance(checkpoint, dict) and self._looks_like_state_dict(checkpoint):
                config = self._load_config()
                state_dict = checkpoint
            else:
                raise ModelLoadError("Checkpoint does not contain a supported state dictionary")
            if not isinstance(state_dict, dict) or not state_dict:
                raise ModelLoadError("Checkpoint state dictionary is empty or invalid")
            model_config = self._validate_config(config)
            model_path = self.settings.project_root / "models" / "aasist" / "models" / "AASIST.py"
            spec = importlib.util.spec_from_file_location("aasist_model", model_path)
            if spec is None or spec.loader is None:
                raise ModelLoadError(f"Unable to load AASIST model from {model_path}")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            model = module.Model(model_config)
            model.load_state_dict(state_dict, strict=True)
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            model.to(device)
            model.eval()
            self._model = model
            self.runtime = ModelRuntime(model, device, True, None, self._sha256(self.settings.model_path))
            logger.info("MODEL LOADER AASIST checkpoint loaded successfully on %s", device)
            return self.runtime
        except Exception as exc:
            error = f"Invalid AASIST checkpoint: {exc}"
            logger.error("MODEL LOADER %s", error)
            self.runtime = ModelRuntime(None, torch.device("cpu"), False, error, None)
            return self.runtime

    def _load_config(self) -> dict[str, Any]:
        config_path = self.settings.project_root / "models" / "aasist" / "config" / "AASIST.conf"
        with config_path.open(encoding="utf-8") as handle:
            return json.load(handle)["model_config"]

    @staticmethod
    def _looks_like_state_dict(checkpoint: dict[str, Any]) -> bool:
        return bool(checkpoint) and all(
            isinstance(key, str) and isinstance(value, torch.Tensor)
            for key, value in checkpoint.items()
        )

    def _validate_config(self, config: Any) -> dict[str, Any]:
        if not isinstance(config, dict):
            raise ModelLoadError("Checkpoint does not contain a valid model_config")
        required = {"architecture", "nb_samp", "first_conv", "filts", "gat_dims", "pool_ratios", "temperatures"}
        missing = required - config.keys()
        if missing:
            raise ModelLoadError(f"Model configuration is missing: {sorted(missing)}")
        if config.get("architecture") != "AASIST":
            raise ModelLoadError("Checkpoint architecture is not AASIST")
        return config

    @staticmethod
    def _sha256(path: Path) -> str:
        import hashlib
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
