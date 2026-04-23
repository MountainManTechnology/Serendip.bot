import pytest

from agent import ingestion
from agent.config import settings


def test_detect_content_type_photography():
    settings.enable_photo_pipeline = True
    site = {
        "url": "https://example.com/gallery",
        "extracted_images": [{"url": "https://example.com/1.jpg", "alt_text": "A lovely view"}],
        "word_count": 10,
    }
    assert ingestion.detect_content_type(site) == "photography"


def test_quality_gate_photography_accept():
    settings.enable_photo_pipeline = True
    site = {
        "quality_score": 0.8,
        "language": "en",
        "extracted_images": [{"url": "https://example.com/1.jpg", "alt_text": "A lovely view"}],
        "content_type": "photography",
        "word_count": 10,
        "behind_paywall": False,
    }
    passed, reason = ingestion.quality_gate(site)
    assert passed is True and reason is None


def test_quality_gate_photography_reject_missing_alt():
    settings.enable_photo_pipeline = True
    site = {
        "quality_score": 0.9,
        "language": "en",
        "extracted_images": [{"url": "https://example.com/1.jpg", "alt_text": ""}],
        "content_type": "photography",
        "word_count": 5,
        "behind_paywall": False,
    }
    passed, reason = ingestion.quality_gate(site)
    assert passed is False
    assert reason == "photo_missing_alt_or_caption"


def test_detect_content_type_comic():
    settings.enable_comic_pipeline = True
    site = {
        "url": "https://example.com/comics/strip",
        "extracted_images": [
            {"url": "https://example.com/1.jpg", "alt_text": "panel 1"},
            {"url": "https://example.com/2.jpg", "alt_text": "panel 2"},
        ],
        "word_count": 20,
    }
    assert ingestion.detect_content_type(site) == "comic"
