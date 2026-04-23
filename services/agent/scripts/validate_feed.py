#!/usr/bin/env python3
"""
RSS/Atom feed validator for the SerendipBot rss-feed-curator skill.

Given one feed URL (or a YAML/JSON file with many), this script:
  1. Fetches the feed
  2. Parses it (Atom, RSS 2.0, RSS 1.0)
  3. Reports: status, item count (last 30d), avg title length,
     publish cadence, language, sample titles, sample item URLs
  4. Flags common quality red flags (PR/marketing patterns, dead feeds,
     thin descriptions, aggregator behavior)

Usage:
    python validate_feed.py <feed_url>
    python validate_feed.py --file feeds.yaml          # validate many
    python validate_feed.py --file feeds.yaml --json   # machine-readable

Output: JSON (with --json) or human-readable summary (default).

Designed to run inside the agent's .venv (feedparser, httpx, pyyaml).
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

try:
    import feedparser  # type: ignore[import-untyped]
    import httpx
    import yaml
except ImportError as exc:
    print(
        f"Missing dependency: {exc.name}. Install with:\n"
        "  pip install feedparser httpx pyyaml --break-system-packages",
        file=sys.stderr,
    )
    sys.exit(2)


USER_AGENT = "SerendipBot-FeedCurator/1.0 (+https://github.com/MountainManTechnology/Serendip.bot)"
HTTP_TIMEOUT = 15.0
FRESH_WINDOW_DAYS = 30

# Red-flag patterns in titles (heuristic — LLM does the real grading)
_PR_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\bpress release\b",
        r"\bnow available\b",
        r"\bpartners with\b",
        r"\bannounces\b",
        r"\b(?:save|sale|discount|coupon|deal|% off)\b",
        r"\bsponsored\b",
        r"\bpromo(?:tion)?\b",
    ]
]

_AGGREGATOR_DOMAINS = frozenset(
    {
        "feedburner.com",
        "rss.app",
        "google.com",
        "feedly.com",
        "flipboard.com",
    }
)


@dataclass
class FeedReport:
    feed_url: str
    fetched: bool = False
    http_status: int | None = None
    parse_ok: bool = False
    feed_title: str = ""
    site_url: str = ""
    language: str = ""
    total_items: int = 0
    items_last_30d: int = 0
    avg_title_chars: float = 0.0
    has_full_content: bool = False
    median_days_between_posts: float | None = None
    sample_titles: list[str] = field(default_factory=list)
    sample_item_urls: list[str] = field(default_factory=list)
    pr_pattern_hits: int = 0
    aggregator_suspect: bool = False
    error: str | None = None
    flags: list[str] = field(default_factory=list)
    verdict: str = "unknown"  # accept | review | reject | broken

    def grade(self) -> None:
        """Populate flags + verdict based on the heuristic findings."""
        if self.error or not self.parse_ok:
            self.verdict = "broken"
            self.flags.append(f"feed_unreachable_or_unparseable: {self.error or 'parse_failed'}")
            return

        if self.items_last_30d < 2:
            self.flags.append(f"low_freshness: only {self.items_last_30d} items in last 30d")

        if self.items_last_30d > 200:
            self.flags.append(
                f"firehose: {self.items_last_30d} items in 30d (likely aggregator or news firehose)"
            )

        if self.avg_title_chars < 25:
            self.flags.append(f"thin_titles: avg {self.avg_title_chars:.0f} chars")

        if self.pr_pattern_hits >= max(2, len(self.sample_titles) // 2):
            self.flags.append(
                f"pr_marketing_pattern: "
                f"{self.pr_pattern_hits}/{len(self.sample_titles)} titles match"
            )

        if self.aggregator_suspect:
            self.flags.append("aggregator_domain")

        if not self.has_full_content:
            self.flags.append("summary_only_no_content")

        # Verdict tiers
        blocking = [
            f
            for f in self.flags
            if any(
                f.startswith(b)
                for b in (
                    "feed_unreachable",
                    "low_freshness",
                    "pr_marketing_pattern",
                    "aggregator_domain",
                    "firehose",
                )
            )
        ]
        if blocking:
            self.verdict = "reject"
        elif self.flags:
            self.verdict = "review"
        else:
            self.verdict = "accept"


def _is_aggregator_domain(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return any(host == d or host.endswith("." + d) for d in _AGGREGATOR_DOMAINS)


def _count_pr_patterns(titles: list[str]) -> int:
    n = 0
    for t in titles:
        for pat in _PR_PATTERNS:
            if pat.search(t):
                n += 1
                break
    return n


def _median_cadence_days(dates: list[datetime]) -> float | None:
    if len(dates) < 3:
        return None
    sorted_dates = sorted(dates, reverse=True)
    deltas = [(sorted_dates[i] - sorted_dates[i + 1]).days for i in range(len(sorted_dates) - 1)]
    deltas = [d for d in deltas if d >= 0]
    return float(statistics.median(deltas)) if deltas else None


def _entry_datetime(entry: Any) -> datetime | None:
    for attr in ("published_parsed", "updated_parsed", "created_parsed"):
        t = getattr(entry, attr, None)
        if t:
            try:
                return datetime(*t[:6], tzinfo=UTC)
            except Exception:
                continue
    return None


def validate_one(feed_url: str) -> FeedReport:
    report = FeedReport(feed_url=feed_url)
    report.aggregator_suspect = _is_aggregator_domain(feed_url)

    try:
        with httpx.Client(
            timeout=HTTP_TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT}
        ) as client:
            resp = client.get(feed_url)
            report.http_status = resp.status_code
            resp.raise_for_status()
            body = resp.content
            report.fetched = True
    except Exception as exc:
        report.error = str(exc)
        report.grade()
        return report

    parsed = feedparser.parse(body)
    if parsed.bozo and not parsed.entries:
        report.error = f"parse_error: {parsed.bozo_exception!r}"
        report.grade()
        return report

    report.parse_ok = True
    report.feed_title = (parsed.feed.get("title") or "").strip()
    report.site_url = (parsed.feed.get("link") or "").strip()
    report.language = (parsed.feed.get("language") or "").strip()
    report.total_items = len(parsed.entries)

    cutoff = datetime.now(UTC) - timedelta(days=FRESH_WINDOW_DAYS)
    fresh_entries = []
    fresh_dates: list[datetime] = []
    titles: list[str] = []
    item_urls: list[str] = []
    has_full = False

    for entry in parsed.entries:
        dt = _entry_datetime(entry)
        title = (entry.get("title") or "").strip()
        link = (entry.get("link") or "").strip()
        content_field = entry.get("content")
        summary = entry.get("summary") or ""
        if content_field and isinstance(content_field, list) and content_field:
            if len(content_field[0].get("value", "")) > 600:
                has_full = True
        elif len(summary) > 800:
            has_full = True

        if dt and dt >= cutoff:
            fresh_entries.append(entry)
            fresh_dates.append(dt)
        if title:
            titles.append(title)
        if link:
            item_urls.append(link)

    report.items_last_30d = len(fresh_entries)
    report.has_full_content = has_full
    if titles:
        report.avg_title_chars = sum(len(t) for t in titles) / len(titles)
    report.sample_titles = titles[:5]
    report.sample_item_urls = item_urls[:5]
    report.pr_pattern_hits = _count_pr_patterns(report.sample_titles)
    report.median_days_between_posts = _median_cadence_days(fresh_dates)

    report.grade()
    return report


def _load_feed_list(path: str) -> list[str]:
    with open(path) as f:
        text = f.read()
    if path.endswith((".yaml", ".yml")):
        data = yaml.safe_load(text)
    elif path.endswith(".json"):
        data = json.loads(text)
    else:
        return [line.strip() for line in text.splitlines() if line.strip()]

    if isinstance(data, list):
        return [str(item) if isinstance(item, str) else str(item.get("url", "")) for item in data]
    if isinstance(data, dict):
        if "feeds" in data:
            return [str(f) if isinstance(f, str) else str(f.get("url", "")) for f in data["feeds"]]
        if "urls" in data:
            return [str(u) for u in data["urls"]]
    return []


def _print_human(report: FeedReport) -> None:
    bar = "─" * 70
    print(bar)
    print(f"{report.verdict.upper():8} {report.feed_url}")
    print(f"         {report.feed_title or '(no title)'}")
    if report.error:
        print(f"  error: {report.error}")
    else:
        print(
            f"  http={report.http_status}  items={report.total_items}  "
            f"fresh30d={report.items_last_30d}  "
            f"cadence~{report.median_days_between_posts}d  lang={report.language or '?'}"
        )
        print(f"  avg_title={report.avg_title_chars:.0f}c  full_content={report.has_full_content}")
    if report.flags:
        for f in report.flags:
            print(f"  ⚑ {f}")
    if report.sample_titles:
        print("  sample:")
        for t in report.sample_titles[:3]:
            print(f"    • {t[:80]}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("url", nargs="?", help="single feed URL")
    p.add_argument("--file", help="path to YAML/JSON/txt with many feed URLs")
    p.add_argument("--json", action="store_true", help="emit JSON instead of human output")
    args = p.parse_args()

    if not args.url and not args.file:
        p.print_help()
        return 1

    urls = [args.url] if args.url else _load_feed_list(args.file)
    reports = [validate_one(u) for u in urls if u]

    if args.json:
        print(json.dumps([asdict(r) for r in reports], indent=2, default=str))
    else:
        for r in reports:
            _print_human(r)
        accept = sum(1 for r in reports if r.verdict == "accept")
        review = sum(1 for r in reports if r.verdict == "review")
        reject = sum(1 for r in reports if r.verdict == "reject")
        broken = sum(1 for r in reports if r.verdict == "broken")
        print("\n" + "=" * 70)
        print(
            f"Summary: {len(reports)} feeds → "
            f"accept={accept} review={review} reject={reject} broken={broken}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
