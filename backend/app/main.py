from __future__ import annotations

import os
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import settings
from .history import HistoryStore
from .inference import create_runtime_loader, run_inference
from .logging import logger
from .model_loader import ModelLoadError
from .preprocess import AudioValidationError, prepare_from_bytes
from .smoothing import smooth_predictions


class LiveChunkRequest(BaseModel):
    audio: bytes
    chunk_index: int = 0
    timestamp: float = 0.0


class SettingsResponse(BaseModel):
    backend_url: str
    model_name: str
    confidence_threshold: float
    spoof_threshold: float
    high_risk_threshold: float
    smoothing_window: int
    sample_rate: int
    input_samples: int
    max_upload_bytes: int


app = FastAPI(title="A.U.D.I.O. Audio Intelligence API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])
store = HistoryStore(settings.database_path)
loader = create_runtime_loader()
recent_predictions: deque[dict[str, Any]] = deque(maxlen=max(1, settings.smoothing_window))


@app.on_event("startup")
def startup() -> None:
    loader.load()


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"backend": "online", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/model/status")
def model_status() -> dict[str, Any]:
    runtime = loader.runtime
    if runtime is None:
        return {"backend": "online", "model": settings.model_name, "model_loaded": False, "device": "cpu", "error": "Model runtime unavailable"}
    return {
        "backend": "online",
        "model": settings.model_name,
        "model_loaded": runtime.model_loaded,
        "device": str(runtime.device),
        "error": runtime.error,
        "checkpoint_sha256": runtime.checkpoint_sha256,
    }


@app.get("/api/settings")
def get_settings() -> SettingsResponse:
    return SettingsResponse(
        backend_url=settings.backend_url,
        model_name=settings.model_name,
        confidence_threshold=settings.confidence_threshold,
        spoof_threshold=settings.spoof_threshold,
        high_risk_threshold=settings.high_risk_threshold,
        smoothing_window=settings.smoothing_window,
        sample_rate=settings.sample_rate,
        input_samples=settings.input_samples,
        max_upload_bytes=settings.max_upload_bytes,
    )


@app.post("/api/analyze")
async def analyze(audio: UploadFile = File(...)) -> dict[str, Any]:
    try:
        if audio.filename and Path(audio.filename).suffix.lower() not in {".wav", ".mp3", ".flac", ".m4a", ".aac", ".ogg"}:
            raise AudioValidationError("Unsupported audio format")
        data = await audio.read()
        if len(data) > settings.max_upload_bytes:
            raise AudioValidationError("Audio exceeds the configured upload limit")
        prepared = prepare_from_bytes(data)
        prediction = run_inference(prepared, loader.runtime)
        if prediction.status == "unavailable":
            raise HTTPException(status_code=503, detail=prediction.model_output)
        record = build_record(audio.filename or "uploaded-audio", prepared.metadata, prediction)
        record_id = store.add(record)
        return {**prediction.__dict__, "id": record_id, "filename": record["filename"], "duration": prepared.metadata.duration, "sample_rate": prepared.metadata.sample_rate, "processing_time_ms": prediction.processing_ms}
    except AudioValidationError as exc:
        logger.error("ERROR Invalid audio: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("ERROR Analysis failed: %s", exc)
        raise HTTPException(status_code=500, detail="Audio analysis failed") from exc


@app.post("/api/analyze/chunk")
async def analyze_chunk(request: LiveChunkRequest) -> dict[str, Any]:
    if len(request.audio) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Audio chunk exceeds the configured limit")
    try:
        prepared = prepare_from_bytes(request.audio)
        prediction = run_inference(prepared, loader.runtime)
        if prediction.status == "unavailable":
            return {"status": "unavailable", "label": "DETECTION UNAVAILABLE", "confidence": None, "risk": None, "chunk_index": request.chunk_index, "timestamp": request.timestamp, "model": settings.model_name}
        recent_predictions.append(prediction.__dict__)
        smoothed = smooth_predictions(list(recent_predictions), settings.smoothing_window)
        return {**prediction.__dict__, **smoothed, "chunk_index": request.chunk_index, "timestamp": request.timestamp, "filename": "live-chunk"}
    except AudioValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/live/start")
def live_start() -> dict[str, Any]:
    return {"status": "started", "mode": "simulated", "message": "Live analysis is ready for a simulated call or microphone input."}


@app.post("/api/live/chunk")
async def live_chunk(request: LiveChunkRequest) -> dict[str, Any]:
    return await analyze_chunk(request)


@app.post("/api/live/stop")
def live_stop() -> dict[str, Any]:
    return {"status": "stopped", "mode": "simulated"}


@app.get("/api/history")
def history(search: str | None = None, risk: str | None = None, limit: int = 50) -> dict[str, Any]:
    return {"items": store.list(search=search, risk=risk, limit=limit), "count": len(store.list(search=search, risk=risk, limit=limit))}


@app.get("/api/history/{analysis_id}")
def history_item(analysis_id: int) -> dict[str, Any]:
    item = store.get(analysis_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return item


@app.delete("/api/history/{analysis_id}")
def delete_history_item(analysis_id: int) -> dict[str, str]:
    if not store.delete(analysis_id):
        raise HTTPException(status_code=404, detail="Analysis not found")
    return {"deleted": True, "id": str(analysis_id)}


@app.get("/api/model/reload")
def reload_model() -> dict[str, Any]:
    runtime = loader.load()
    return model_status() | {"reloaded": runtime.model_loaded, "error": runtime.error}


def build_record(filename: str, metadata: Any, prediction: Any) -> dict[str, Any]:
    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "filename": filename,
        "duration": metadata.duration,
        "sample_rate": metadata.sample_rate,
        "status": prediction.status,
        "label": prediction.label,
        "confidence": prediction.confidence,
        "risk": prediction.risk,
        "model": prediction.model,
        "processing_ms": prediction.processing_ms,
        "model_output": prediction.model_output,
    }
