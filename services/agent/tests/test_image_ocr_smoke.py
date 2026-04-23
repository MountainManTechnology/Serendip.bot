import json
import os
from typing import Any

import pytest

import agent.ingestion as ingestion

if not (os.getenv("AZURE_COMPUTER_VISION_ENDPOINT") and os.getenv("AZURE_COMPUTER_VISION_KEY")):
    pytest.skip("Azure Computer Vision not configured", allow_module_level=True)


class FakeCursor:
    def __init__(self, row):
        self.row = row
        self.exec_calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def execute(self, query, params=None):
        self.exec_calls.append((query, params))

    async def fetchone(self):
        return self.row


class FakeConn:
    def __init__(self, row):
        self.row = row
        self.cursors = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    def cursor(self):
        cur = FakeCursor(self.row)
        self.cursors.append(cur)
        return cur

    async def commit(self):
        return None


def _payload_text(payload: Any) -> str:
    payload = getattr(payload, "obj", payload)
    if isinstance(payload, bytes):
        return payload.decode()
    if isinstance(payload, str):
        return payload
    return json.dumps(payload)


@pytest.mark.asyncio
async def test_azure_ocr_pipeline(monkeypatch):
    # Uses real Azure Computer Vision — guard via env var in CI
    site_id = "test-site-ocr-0001"
    images = [{"url": "https://via.placeholder.com/300", "alt": "placeholder"}]
    row = {"id": site_id, "url": "https://example.com", "extracted_images": images}

    conn_holder = {}

    async def fake_get_conn():
        conn_holder["conn"] = FakeConn(row)
        return conn_holder["conn"]

    monkeypatch.setenv("IMAGE_MIRROR_DIR", "/tmp")
    monkeypatch.setattr(ingestion, "get_connection", fake_get_conn)

    res = await ingestion.process_image_site(site_id)
    assert res is not None
    assert res["site_id"] == site_id
    # Ensure that OCR-enriched extracted_images were persisted (contains ocr_text)
    conn = conn_holder.get("conn")
    assert conn is not None
    found = False
    for cur in conn.cursors:
        for q, params in cur.exec_calls:
            if q and "extracted_images" in q and params:
                payload = _payload_text(params[0])
                if '"ocr_text"' in payload:
                    found = True
    assert found, "Expected persisted extracted_images to include 'ocr_text' after OCR"
