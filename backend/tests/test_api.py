from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_health_and_model_status_are_available() -> None:
    with TestClient(app) as client:
        health = client.get("/api/health")
        model_status = client.get("/api/model/status")

    assert health.status_code == 200
    assert health.json()["backend"] == "online"
    assert model_status.status_code == 200
    assert model_status.json()["model_loaded"] is True
    assert model_status.json()["error"] is None
    assert model_status.json()["model"] == "AASIST"
