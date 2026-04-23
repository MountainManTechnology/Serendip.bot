from __future__ import annotations

import hashlib
import json
import sys
import types
from pathlib import Path
from typing import Any

import httpx
import pytest

fake_crawler = types.ModuleType("agent.crawler")
fake_crawler.Crawler = object
sys.modules.setdefault("agent.crawler", fake_crawler)

fake_db = types.ModuleType("agent.db")


async def _unused_db(*args: Any, **kwargs: Any) -> Any:
    raise NotImplementedError


fake_db.backfill_mood_affinities_batch = _unused_db
fake_db.get_connection = _unused_db
fake_db.get_pending_ingest_batch = _unused_db
fake_db.reset_stuck_crawling = _unused_db
fake_db.update_ingest_status = _unused_db
fake_db.upsert_site_cache = _unused_db
sys.modules.setdefault("agent.db", fake_db)

fake_logging = types.ModuleType("agent.logging")


class _FakeLog:
    def info(self, *args: Any, **kwargs: Any) -> None:
        return None

    def warning(self, *args: Any, **kwargs: Any) -> None:
        return None


fake_logging.log = _FakeLog()
sys.modules.setdefault("agent.logging", fake_logging)

import agent.ingestion as ingestion
import agent.providers.router as provider_router

IMAGE_URL = "https://example.com/image.jpg"
IMAGE_BYTES = b"fake-image-bytes"


class FakeResponse:
    def __init__(
        self,
        *,
        status_code: int = 200,
        content: bytes = b"",
        headers: dict[str, str] | None = None,
        json_data: dict[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.content = content
        self.headers = headers or {}
        self._json_data = json_data or {}

    def json(self) -> dict[str, Any]:
        return self._json_data


class MirrorOnlyAsyncClient:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        pass

    async def __aenter__(self) -> MirrorOnlyAsyncClient:
        return self

    async def __aexit__(self, *args: Any) -> bool:
        return False

    async def get(self, url: str) -> FakeResponse:
        assert url == IMAGE_URL
        return FakeResponse(
            content=IMAGE_BYTES,
            headers={"content-type": "image/jpeg"},
        )


class MirrorAndOcrAsyncClient(MirrorOnlyAsyncClient):
    async def post(
        self,
        url: str,
        *,
        json: dict[str, Any] | None = None,
        content: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> FakeResponse:
        assert content == IMAGE_BYTES
        return FakeResponse(
            json_data={
                "regions": [
                    {
                        "lines": [
                            {
                                "words": [
                                    {"text": "hello"},
                                    {"text": "world"},
                                ]
                            }
                        ]
                    }
                ]
            }
        )


class FakeCursor:
    def __init__(self, row: dict[str, Any]) -> None:
        self.row = row
        self.exec_calls: list[tuple[str, tuple[Any, ...] | None]] = []

    async def __aenter__(self) -> FakeCursor:
        return self

    async def __aexit__(self, *args: Any) -> bool:
        return False

    async def execute(self, query: str, params: tuple[Any, ...] | None = None) -> None:
        self.exec_calls.append((query, params))

    async def fetchone(self) -> dict[str, Any]:
        return self.row


class FakeConn:
    def __init__(self, row: dict[str, Any]) -> None:
        self.row = row
        self.cursors: list[FakeCursor] = []

    async def __aenter__(self) -> FakeConn:
        return self

    async def __aexit__(self, *args: Any) -> bool:
        return False

    def cursor(self) -> FakeCursor:
        cur = FakeCursor(self.row)
        self.cursors.append(cur)
        return cur

    async def commit(self) -> None:
        return None


def _payload_text(payload: Any) -> str:
    payload = getattr(payload, "obj", payload)
    if isinstance(payload, bytes):
        return payload.decode()
    if isinstance(payload, str):
        return payload
    return json.dumps(payload)


def _payloads_for_query(conn: FakeConn, fragment: str) -> list[str]:
    payloads: list[str] = []
    for cur in conn.cursors:
        for query, params in cur.exec_calls:
            if query and fragment in query and params:
                payloads.append(_payload_text(params[0]))
    return payloads


@pytest.mark.asyncio
async def test_image_mirroring_local_persists_json_safe_payload(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    site_id = "test-site-0001"
    images = [{"url": IMAGE_URL, "alt": "placeholder"}]
    row = {"id": site_id, "url": "https://example.com", "extracted_images": images}

    conn_holder: dict[str, FakeConn] = {}

    async def fake_get_conn() -> FakeConn:
        conn_holder["conn"] = FakeConn(row)
        return conn_holder["conn"]

    monkeypatch.setattr(httpx, "AsyncClient", MirrorOnlyAsyncClient)
    monkeypatch.setenv("IMAGE_MIRROR_DIR", str(tmp_path))
    monkeypatch.setenv("AZURE_STORAGE_CONNECTION_STRING", "")
    monkeypatch.setenv("AZURE_STORAGE_CONTAINER", "")
    monkeypatch.delenv("AZURE_COMPUTER_VISION_ENDPOINT", raising=False)
    monkeypatch.delenv("AZURE_COMPUTER_VISION_KEY", raising=False)
    monkeypatch.setattr(ingestion, "get_connection", fake_get_conn)

    res = await ingestion.process_image_site(site_id)
    assert res is not None
    assert res["site_id"] == site_id
    assert res["image_count"] == 1

    fname = hashlib.sha256(IMAGE_URL.encode()).hexdigest()[:24] + ".jpg"
    dest = tmp_path / site_id / fname
    assert dest.exists()

    conn = conn_holder["conn"]
    payloads = _payloads_for_query(conn, "extracted_images")
    assert payloads
    assert any('"mirror"' in payload for payload in payloads)
    assert all('"_bytes"' not in payload for payload in payloads)
    assert all('"_mime_type"' not in payload for payload in payloads)


@pytest.mark.asyncio
async def test_image_ocr_keeps_site_text_embedding(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    site_id = "test-site-ocr-0001"
    images = [{"url": IMAGE_URL, "alt": "placeholder"}]
    row = {"id": site_id, "url": "https://example.com", "extracted_images": images}

    conn_holder: dict[str, FakeConn] = {}

    async def fake_get_conn() -> FakeConn:
        conn_holder["conn"] = FakeConn(row)
        return conn_holder["conn"]

    async def fake_embed(text: str, trace_id: str | None = None) -> list[float]:
        return [0.1, 0.2, 0.3]

    async def fake_embed_image(
        image_bytes: bytes, mime_type: str, trace_id: str | None = None
    ) -> list[float]:
        assert image_bytes == IMAGE_BYTES
        assert mime_type == "image/jpeg"
        return [0.4, 0.5, 0.6]

    monkeypatch.setattr(httpx, "AsyncClient", MirrorAndOcrAsyncClient)
    monkeypatch.setenv("IMAGE_MIRROR_DIR", str(tmp_path))
    monkeypatch.setenv("AZURE_STORAGE_CONNECTION_STRING", "")
    monkeypatch.setenv("AZURE_STORAGE_CONTAINER", "")
    monkeypatch.setenv("AZURE_COMPUTER_VISION_ENDPOINT", "https://vision.example.com")
    monkeypatch.setenv("AZURE_COMPUTER_VISION_KEY", "test-key")
    monkeypatch.setattr(ingestion, "get_connection", fake_get_conn)
    monkeypatch.setattr(ingestion.default_router, "embed", fake_embed)
    monkeypatch.setattr(provider_router, "embed_image", fake_embed_image)

    res = await ingestion.process_image_site(site_id)
    assert res is not None
    assert res["site_id"] == site_id
    assert res["image_count"] == 1

    conn = conn_holder["conn"]
    queries = [query for cur in conn.cursors for query, _ in cur.exec_calls]
    assert not any("SET embedding = %s::vector" in query for query in queries)

    payloads = _payloads_for_query(conn, "extracted_images")
    assert payloads
    assert any('"ocr_text"' in payload for payload in payloads)
    assert any('"image_embedding"' in payload for payload in payloads)
