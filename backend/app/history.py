from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import settings
from .logging import logger


class HistoryStore:
    def __init__(self, database_path: Path = settings.database_path) -> None:
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS analyses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    duration REAL NOT NULL,
                    sample_rate INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    label TEXT NOT NULL,
                    confidence REAL,
                    risk TEXT,
                    model TEXT NOT NULL,
                    processing_ms INTEGER NOT NULL,
                    model_output TEXT NOT NULL
                )
            """)
            connection.execute("CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at)")

    def add(self, item: dict[str, Any]) -> int:
        with self._connect() as connection:
            cursor = connection.execute("""
                INSERT INTO analyses (created_at, filename, duration, sample_rate, status, label,
                                     confidence, risk, model, processing_ms, model_output)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item["created_at"], item["filename"], item["duration"], item["sample_rate"],
                item["status"], item["label"], item["confidence"], item["risk"], item["model"],
                item["processing_ms"], item["model_output"],
            ))
            return int(cursor.lastrowid)

    def list(self, search: str | None = None, risk: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        query = "SELECT * FROM analyses"
        conditions: list[str] = []
        parameters: list[str] = []
        if search:
            conditions.append("(filename LIKE ? OR label LIKE ? OR status LIKE ?)")
            pattern = f"%{search}%"
            parameters.extend([pattern, pattern, pattern])
        if risk:
            conditions.append("risk = ?")
            parameters.append(risk)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY created_at DESC LIMIT ?"
        parameters.append(str(limit))
        with self._connect() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [dict(row) for row in rows]

    def get(self, analysis_id: int) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM analyses WHERE id = ?", (analysis_id,)).fetchone()
        return dict(row) if row else None

    def delete(self, analysis_id: int) -> bool:
        with self._connect() as connection:
            cursor = connection.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))
        return cursor.rowcount == 1
