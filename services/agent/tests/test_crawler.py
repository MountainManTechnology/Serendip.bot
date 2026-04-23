"""Unit tests for the web crawler — uses pytest-httpx to mock all HTTP."""

from __future__ import annotations

import pytest
from pytest_httpx import HTTPXMock

from agent.crawler import Crawler, CrawlResult

HTML_SIMPLE = """<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
  <meta name="description" content="A test page for unit testing">
</head>
<body>
  <article>
    <h1>Test Article</h1>
    <p>This is the main content of the test article. It has enough words to pass
    the word count check and to be considered a proper piece of readable content
    that the readability library can extract cleanly.</p>
    <img src="/images/hero.jpg" alt="Hero image">
    <a href="https://example.com/other">Other link</a>
    <a href="https://external.com/page">External link</a>
  </article>
</body>
</html>"""

ROBOTS_ALLOW = "User-agent: *\nAllow: /"
ROBOTS_DISALLOW = "User-agent: *\nDisallow: /"


@pytest.mark.asyncio
async def test_crawl_url_success(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url="https://example.com/robots.txt",
        text=ROBOTS_ALLOW,
        headers={"content-type": "text/plain"},
    )
    httpx_mock.add_response(
        url="https://example.com/article",
        text=HTML_SIMPLE,
        headers={"content-type": "text/html; charset=utf-8"},
    )

    crawler = Crawler()
    result = await crawler.crawl_url("https://example.com/article")

    assert result.status_code == 200
    assert result.title != ""
    assert result.error is None
    assert result.word_count > 0
    assert len(result.extracted_images) >= 1
    assert any("external.com" in link for link in result.outbound_links)


@pytest.mark.asyncio
async def test_crawl_url_blocked_by_robots(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url="https://blocked.com/robots.txt",
        text=ROBOTS_DISALLOW,
        headers={"content-type": "text/plain"},
    )

    crawler = Crawler()
    result = await crawler.crawl_url("https://blocked.com/page")

    assert result.error == "blocked_by_robots"
    assert result.status_code == 0


@pytest.mark.asyncio
async def test_crawl_url_non_html(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url="https://example.com/robots.txt",
        text=ROBOTS_ALLOW,
        headers={"content-type": "text/plain"},
    )
    httpx_mock.add_response(
        url="https://example.com/file.pdf",
        content=b"%PDF-1.4 ...",
        headers={"content-type": "application/pdf"},
    )

    crawler = Crawler()
    result = await crawler.crawl_url("https://example.com/file.pdf")

    assert result.error is not None
    assert "non_html" in result.error


@pytest.mark.asyncio
async def test_crawl_url_timeout(httpx_mock: HTTPXMock) -> None:
    import httpx

    httpx_mock.add_response(
        url="https://slow.com/robots.txt",
        text=ROBOTS_ALLOW,
        headers={"content-type": "text/plain"},
    )
    httpx_mock.add_exception(httpx.ReadTimeout("timed out"), url="https://slow.com/page")

    crawler = Crawler()
    result = await crawler.crawl_url("https://slow.com/page")

    assert result.error is not None
    assert result.status_code == 0


@pytest.mark.asyncio
async def test_crawl_batch(httpx_mock: HTTPXMock) -> None:
    for i in range(3):
        httpx_mock.add_response(
            url=f"https://site{i}.com/robots.txt",
            text=ROBOTS_ALLOW,
            headers={"content-type": "text/plain"},
        )
        httpx_mock.add_response(
            url=f"https://site{i}.com/",
            text=HTML_SIMPLE,
            headers={"content-type": "text/html"},
        )

    crawler = Crawler()
    results = await crawler.crawl_batch(
        ["https://site0.com/", "https://site1.com/", "https://site2.com/"]
    )

    assert len(results) == 3
    assert all(isinstance(r, CrawlResult) for r in results)


def test_url_hash_is_sha256() -> None:
    import hashlib

    crawler = Crawler()
    result = crawler._parse("https://example.com", 200, HTML_SIMPLE, 100)
    expected = hashlib.sha256(b"https://example.com").hexdigest()
    assert result.url_hash == expected
