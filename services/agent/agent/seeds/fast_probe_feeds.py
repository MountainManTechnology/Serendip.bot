#!/usr/bin/env python3
"""Fast feed endpoint probing - try common paths on known domains."""

import asyncio
import httpx
import yaml
from pathlib import Path
from collections import defaultdict

SEED_DIR = Path(__file__).parent

# Common RSS/Atom feed endpoint patterns to try
FEED_PROBES = [
    "/feed", "/feed/", "/rss", "/rss.xml", "/feed.xml", "/atom.xml",
    "/feeds", "/feeds/", "/feeds/rss", "/feeds/atom", "/feeds/all.xml",
    "/blog/feed", "/blog/rss", "/blog/atom.xml",
    "/news/feed", "/news/rss",
    "/articles/feed", "/posts/feed",
    "/index.xml", "/index.atom",
    "/?feed=rss2", "/?feed=atom", "/?feed=rss",
    "/category/feed", "/latest/feed",
]

# Categories and seed domains from earlier bootstrap
DOMAINS_BY_CATEGORY = {
    "culture": [
        "theguardian.com", "bbc.com", "variety.com", "deadline.com",
        "artforum.com", "hyperallergic.com", "frieze.com", "theartdesk.com",
    ],
    "health": [
        "healthline.com", "webmd.com", "medscape.com", "statnews.com",
        "self.com", "menshealth.com", "womenshealthmag.com", "psychologytoday.com",
    ],
    "humor": [
        "theonion.com", "clickhole.com", "mcsweeneys.com", "reductress.com",
        "the-toast.net", "splinter.news",
    ],
    "travel": [
        "lonelyplanet.com", "condenastvtravel.com", "thepointergroup.com",
        "nomads.com", "adventurejournal.com", "wanderlust.com",
    ],
    "gaming": [
        "kotaku.com", "polygon.com", "gamespot.com", "ign.com",
        "rockpapershotgun.com", "destructoid.com", "vg247.com",
    ],
    "history": [
        "historyweb.com", "smithsonianmag.com", "atlasoscura.com",
        "historytoday.com", "publicdomainreview.org", "cabinetmagazine.org",
    ],
}


async def is_valid_feed(content: str) -> bool:
    """Check if response looks like RSS/Atom feed."""
    if not content:
        return False
    lower = content[:500].lower()
    return any(x in lower for x in ["rss", "atom", "<entry", "<item"])


async def probe_feed_endpoint(base_url: str, path: str, client: httpx.AsyncClient) -> str | None:
    """Try a single feed endpoint."""
    url = base_url + path
    try:
        response = await asyncio.wait_for(
            client.get(url, follow_redirects=True, timeout=3),
            timeout=3,
        )
        if response.status_code == 200:
            if await is_valid_feed(response.text):
                return url
    except Exception:
        pass
    return None


async def probe_domain(domain: str, client: httpx.AsyncClient) -> list[str]:
    """Probe all common feed endpoints on a domain."""
    base_url = f"https://{domain}" if not domain.startswith("http") else domain
    found = []
    
    # Probe endpoints concurrently (max 5 at a time)
    semaphore = asyncio.Semaphore(5)
    
    async def _probe(path):
        async with semaphore:
            return await probe_feed_endpoint(base_url, path, client)
    
    tasks = [_probe(path) for path in FEED_PROBES]
    results = await asyncio.gather(*tasks)
    
    found = [url for url in results if url]
    return found


async def discover_category(category: str, domains: list[str]) -> int:
    """Probe all domains in a category and save results."""
    print(f"\n{'='*70}")
    print(f"📚 {category.upper()}")
    print(f"{'='*70}")
    
    all_feeds = set()
    
    async with httpx.AsyncClient() as client:
        for i, domain in enumerate(domains):
            print(f"  {i+1:2d}. {domain:<30}", end=" ", flush=True)
            feeds = await probe_domain(domain, client)
            
            if feeds:
                print(f"✓ {len(feeds)} feed(s)")
                all_feeds.update(feeds)
            else:
                print("✗")
            
            await asyncio.sleep(0.2)  # Rate limit
    
    all_feeds = list(all_feeds)
    print(f"\n→ Total unique feeds: {len(all_feeds)}")
    
    if not all_feeds:
        print(f"❌ No feeds found")
        return 0
    
    # Load existing
    seed_file = SEED_DIR / f"{category}_seeds.yaml"
    if seed_file.exists():
        with open(seed_file) as f:
            existing = yaml.safe_load(f) or {}
            existing_urls = set(feed["url"] for feed in existing.get("feeds", []))
    else:
        existing_urls = set()
    
    # New feeds
    new_feeds = [url for url in all_feeds if url not in existing_urls]
    print(f"✅ {len(new_feeds)} NEW | Total will be: {len(new_feeds) + len(existing_urls)}")
    
    # Merge and save
    feeds_list = [
        {"url": url, "status": "found_via_probe"}
        for url in new_feeds
    ]
    
    if existing_urls:
        feeds_list.extend([
            {"url": url, "status": "valid"}
            for url in existing_urls
        ])
    
    output = {
        "category": category,
        "count": len(feeds_list),
        "feeds": feeds_list,
    }
    
    with open(seed_file, "w") as f:
        yaml.dump(output, f, default_flow_style=False, sort_keys=False)
    
    return len(new_feeds)


async def main():
    """Discover feeds for all categories via endpoint probing."""
    total_new = 0
    
    for i, (category, domains) in enumerate(DOMAINS_BY_CATEGORY.items()):
        count = await discover_category(category, domains)
        total_new += count
        
        if i < len(DOMAINS_BY_CATEGORY) - 1:
            await asyncio.sleep(1)
    
    print(f"\n{'='*70}")
    print(f"✨ FAST PROBE DISCOVERY COMPLETE")
    print(f"Total new feeds: {total_new}")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    asyncio.run(main())
