from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

from .config import settings
from .logging import logger


class AudioValidationError(ValueError):
    pass


@dataclass(frozen=True)
class AudioMetadata:
    duration: float
    sample_rate: int
    channels: int
    samples: int
    peak: float


@dataclass(frozen=True)
class PreparedAudio:
    tensor: np.ndarray
    metadata: AudioMetadata


def validate_and_prepare(path: Path, target_rate: int = settings.sample_rate, target_samples: int = settings.input_samples) -> PreparedAudio:
    try:
        with sf.SoundFile(path) as audio:
            if audio.frames == 0:
                raise AudioValidationError("Audio file contains no samples")
            source_rate = int(audio.samplerate)
            channels = int(audio.channels)
            duration = float(audio.frames / source_rate)
            if duration < 0.05:
                raise AudioValidationError("Audio is too short for reliable analysis")
            if source_rate <= 0 or channels <= 0:
                raise AudioValidationError("Audio metadata is invalid")
            samples = audio.read(dtype="float64", always_2d=True)
            peak = float(np.max(np.abs(samples))) if samples.size else 0.0
            if peak <= 0.0:
                raise AudioValidationError("Audio contains no usable signal")

            mono = samples.mean(axis=1)
            if source_rate != target_rate:
                from scipy.signal import resample_poly
                mono = resample_poly(mono, target_rate, source_rate)
            if mono.size < target_samples:
                mono = np.pad(mono, (0, target_samples - mono.size), mode="constant")
            else:
                mono = mono[:target_samples]
            mono = mono.astype(np.float32)
            metadata = AudioMetadata(duration=duration, sample_rate=target_rate, channels=1, samples=int(mono.size), peak=peak)
            return PreparedAudio(tensor=mono, metadata=metadata)
    except (sf.LibsndfileError, OSError) as exc:
        raise AudioValidationError(f"Unable to decode audio: {exc}") from exc


def prepare_from_bytes(data: bytes) -> PreparedAudio:
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
        handle.write(data)
        path = Path(handle.name)
    try:
        return validate_and_prepare(path)
    finally:
        path.unlink(missing_ok=True)
