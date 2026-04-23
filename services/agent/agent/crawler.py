"""Async web crawler with content extraction, robots.txt respect, and rate limiting."""

from __future__ import annotations

import asyncio
import hashlib
import time
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from readability import Document
from robotexclusionrulesparser import RobotExclusionRulesParser

from agent.config import settings
from agent.logging import log
from agent.url_safety import is_safe_url

USER_AGENT = "SerendipBot/1.0 (+https://github.com/MountainManTechnology/Serendip.bot)"
MAX_CONTENT_CHARS = 5_000
MAX_CONTENT_BYTES = 2 * 1024 * 1024  # 2 MB — hard ceiling to prevent DoS via huge pages
MAX_IMAGES = 5
MAX_REDIRECTS = 10


@dataclass
class CrawlResult:
    url: str
    status_code: int
    title: str
    description: str
    content_text: str
    content_html: str
    extracted_images: list[dict[str, str]] = field(default_factory=list)
    outbound_links: list[str] = field(default_factory=list)
    word_count: int = 0
    language: str = "en"
    fetch_time_ms: int = 0
    error: str | None = None

    @property
    def url_hash(self) -> str:
        return hashlib.sha256(self.url.encode()).hexdigest()


class DomainRateLimiter:
    """Simple per-domain token-bucket rate limiter."""

    def __init__(self, rate: float = 1.0) -> None:
        self._rate = rate
        self._last_call: dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def acquire(self, domain: str) -> None:
        async with self._lock:
            now = time.monotonic()
            last = self._last_call.get(domain, 0.0)
            wait = (1.0 / self._rate) - (now - last)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_call[domain] = time.monotonic()


class Crawler:
    def __init__(self) -> None:
        self._rate_limiter = DomainRateLimiter(settings.crawler_rate_limit_per_domain)
        self._robots_cache: dict[str, RobotExclusionRulesParser] = {}
        self._semaphore = asyncio.Semaphore(settings.crawler_max_concurrency)

    async def _get_robots(
        self, client: httpx.AsyncClient, base_url: str
    ) -> RobotExclusionRulesParser:
        parsed = urlparse(base_url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin in self._robots_cache:
            return self._robots_cache[origin]
        parser = RobotExclusionRulesParser()
        try:
            resp = await client.get(f"{origin}/robots.txt", timeout=5.0)
            if resp.status_code == 200:
                parser.parse(resp.text)
        except Exception:
            pass  # If robots.txt fails, allow crawling
        self._robots_cache[origin] = parser
        return parser

    async def crawl_url(self, url: str) -> CrawlResult:
        # SSRF check before any network request
        if not is_safe_url(url):
            log.warning("ssrf_blocked", url=url)
            return CrawlResult(
                url=url,
                status_code=0,
                title="",
                description="",
                content_text="",
                content_html="",
                error="ssrf_blocked",
            )

        domain = urlparse(url).netloc
        start = time.monotonic()

        async with self._semaphore:
            async with httpx.AsyncClient(
                headers={"User-Agent": USER_AGENT},
                follow_redirects=False,  # handle redirects manually for SSRF re-check
                timeout=settings.crawler_timeout_seconds,
                max_redirects=0,
            ) as client:
                # robots.txt check
                robots = await self._get_robots(client, url)
                if not robots.is_allowed(USER_AGENT, url):
                    log.info("robots_blocked", url=url)
                    return CrawlResult(
                        url=url,
                        status_code=0,
                        title="",
                        description="",
                        content_text="",
                        content_html="",
                        error="blocked_by_robots",
                    )

                await self._rate_limiter.acquire(domain)

                try:
                    resp = await self._fetch_with_safe_redirects(client, url)
                except Exception as exc:
                    return CrawlResult(
                        url=url,
                        status_code=0,
                        title="",
                        description="",
                        content_text="",
                        content_html="",
                        error=str(exc),
                        fetch_time_ms=int((time.monotonic() - start) * 1000),
                    )

                fetch_ms = int((time.monotonic() - start) * 1000)

                # Non-HTML content type — skip
                content_type = resp.headers.get("content-type", "")
                if "text/html" not in content_type:
                    return CrawlResult(
                        url=str(resp.url),
                        status_code=resp.status_code,
                        title="",
                        description="",
                        content_text="",
                        content_html="",
                        error=f"non_html:{content_type}",
                        fetch_time_ms=fetch_ms,
                    )

                # Enforce content size limit
                body = resp.text[:MAX_CONTENT_BYTES]

                return self._parse(str(resp.url), resp.status_code, body, fetch_ms)

    async def _fetch_with_safe_redirects(
        self, client: httpx.AsyncClient, url: str
    ) -> httpx.Response:
        """Follow redirects manually, re-checking each hop against SSRF allowlist."""
        current_url = url
        for _ in range(MAX_REDIRECTS):
            resp = await client.get(current_url)
            if resp.is_redirect or resp.has_redirect_location:
                location = resp.headers.get("location", "")
                next_url = urljoin(current_url, location)
                if not is_safe_url(next_url):
                    log.warning("ssrf_blocked_redirect", from_url=current_url, to_url=next_url)
                    raise ValueError(f"ssrf_blocked_redirect: {next_url}")
                current_url = next_url
            else:
                return resp
        raise ValueError(f"too_many_redirects: {url}")

    def _parse(self, url: str, status_code: int, html: str, fetch_ms: int) -> CrawlResult:
        soup = BeautifulSoup(html, "lxml")

        # Meta description
        meta_desc_tag = soup.find("meta", attrs={"name": "description"})
        description = ""
        if meta_desc_tag and hasattr(meta_desc_tag, "get"):
            description = str(meta_desc_tag.get("content", ""))

        # Readability extraction
        doc = Document(html)
        title = doc.title() or ""
        content_html = doc.summary(html_partial=True)
        content_soup = BeautifulSoup(content_html, "lxml")
        content_text = content_soup.get_text(separator=" ", strip=True)[:MAX_CONTENT_CHARS]
        word_count = len(content_text.split())

        # Image extraction
        base_parsed = urlparse(url)
        base_origin = f"{base_parsed.scheme}://{base_parsed.netloc}"
        images: list[dict[str, str]] = []
        for img in soup.find_all("img", src=True)[:MAX_IMAGES]:
            src = str(img.get("src", ""))
            if src:
                abs_url = urljoin(base_origin, src)
                images.append({"url": abs_url, "alt_text": str(img.get("alt", ""))})

        # Outbound link extraction (for seed snowball) — SSRF-filtered
        links: list[str] = []
        for a in soup.find_all("a", href=True):
            href = str(a.get("href", ""))
            if href.startswith("http"):
                abs_url = href
            elif href.startswith("/"):
                abs_url = urljoin(base_origin, href)
            else:
                continue
            if is_safe_url(abs_url):
                links.append(abs_url)

        return CrawlResult(
            url=url,
            status_code=status_code,
            title=title,
            description=description,
            content_text=content_text,
            content_html=content_html,
            extracted_images=images,
            outbound_links=list(set(links)),
            word_count=word_count,
            fetch_time_ms=fetch_ms,
        )

    async def crawl_batch(self, urls: list[str]) -> list[CrawlResult]:
        tasks = [self.crawl_url(u) for u in urls]
        return list(await asyncio.gather(*tasks, return_exceptions=False))
