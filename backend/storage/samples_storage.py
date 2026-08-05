"""
GeoVault — Training Samples storage layer.
Uses local filesystem via StorageService (replaces Replit Object Storage).
"""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Optional

from .storage_service import StorageService


@dataclass
class TrainingSample:
    id: str
    geometry: dict[str, Any]
    class_label: str
    class_value: int = 1
    source_filename: str = "manual"
    source_url: str = ""
    creator: str = "anonymous"
    color: str = "#0F6E4F"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def load_samples() -> list[dict[str, Any]]:
    return StorageService.load_samples()


def _save_samples(records: list[dict[str, Any]]) -> None:
    StorageService.save_samples(records)


def add_sample(sample: TrainingSample) -> dict[str, Any]:
    records = load_samples()
    d = sample.to_dict()
    records.append(d)
    _save_samples(records)
    return d


def delete_sample(sample_id: str) -> bool:
    records = load_samples()
    new = [r for r in records if r["id"] != sample_id]
    if len(new) == len(records):
        return False
    _save_samples(new)
    return True


def samples_to_geojson(records: list[dict[str, Any]]) -> dict:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": r["geometry"],
                "properties": {k: v for k, v in r.items() if k != "geometry"},
            }
            for r in records
        ],
    }
