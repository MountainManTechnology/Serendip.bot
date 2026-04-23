#!/usr/bin/env python3
"""
Content scraper for websites without RSS feeds.
Extracts articles/blog posts and generates synthetic feed-like data.
"""

import asyncio
import httpx
from datetime import datetime, timedelta
from pathlib import Path
import re
from urllib.parse import urljoin, urlparse
import json
from typing import Optional

SEED_DIR = Path(__file__).parent


class ContentScraper:
    """Extract content from websites without RSS feeds."""
    
    def __init__(self, timeout: int = 10):
        self.timeout = timeout
    
    async def fetch(self, url: str, client: httpx.AsyncClient) -> Optional[str]:
        """Fetch page content."""
        try:
            response = await asyncio.wait_for(
                client.get(url, follow_redirects=True, timeout=self.timeout),
                timeout=self.timeout,
            )
            if response.status_code == 200:
                return response.text
        except Exception:
            pass
        return None
    
    def extract_articles(self, url: str, html: str) -> list[dict]:
        """Extract article links and metadata from HTML."""
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            return []
        
        soup = BeautifulSoup(html, "html.parser")
        articles = []
        
        # Common blog/article selectors
        article_selectors = [
            "article", "post", "entry",  # Semantic elements
            "[role='article']",
            ".post", ".article", ".entry",  # Common classes
            ".blog-post", ".blog-item",
            "h2, h3",  # Heading-based (with context)
        ]
        
        seen_urls = set()
        domain = urlparse(url).netloc
        
        for selector in article_selectors:
            if len(articles) > 10:
                break
            
            elements = soup.select(selector)
            for elem in elements[:15]:
                # Find link in element
                link = elem.find("a", href=True)
                if not link:
                    continue
                
                href = link.get("href")
                if not href:
                    continue
                
                # Resolve relative URLs
                if href.startswith("/") or not href.startswith("http"):
                    href = urljoin(url, href)
                
                # Only same domain
                if urlparse(href).netloc != domain:
                    continue
                
                # Skip duplicates and non-content URLs
                if href in seen_urls or any(x in href.lower() for x in ["/category/", "/tag/", "/author/", "/page/"]):
                    continue
                
                seen_urls.add(href)
                
                # Extract title
                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    title = elem.get_text(strip=True)[:100]
                
                articles.append({
                    "url": href,
                    "title": title[:150],
                })
        
        return articles[:10]
    
    def extract_metadata(self, html: str, url: str) -> dict:
        """Extract metadata (date, description, etc.)."""
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            return {"description": "", "publish_date": None}
        
        soup = BeautifulSoup(html, "html.parser")
        
        # Try common meta tags
        description = ""
        for meta in soup.find_all("meta", {"name": ["description", "og:description"]}):
            description = meta.get("content", "")
            if description:
                break
        
        # Try to find publication date
        publish_date = None
        date_selectors = [
            "time",
            "article time",
            "[datetime]",
            ".publish-date",
            ".posted-on",
        ]
        
        for selector in date_selectors:
            elem = soup.select_one(selector)
            if elem:
                date_str = elem.get("datetime") or elem.get_text(strip=True)
                # Try to parse it
                if date_str and len(date_str) > 0:
                    publish_date = date_str[:19]  # ISO format
                    break
        
        return {
            "description": description[:200],
            "publish_date": publish_date,
        }


async def discover_site_content(domain: str) -> dict:
    """Discover content structure on a site."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return {"domain": domain, "status": "no_beautifulsoup"}
    
    url = f"https://{domain}" if not domain.startswith("http") else domain
    
    scraper = ContentScraper()
    async with httpx.AsyncClient() as client:
        html = await scraper.fetch(url, client)
        if not html:
            return {"domain": domain, "status": "unreachable"}
        
        # Check for likely content sections
        soup = BeautifulSoup(html, "html.parser")
        
        # Find blog/article section links
        content_paths = []
        for link in soup.find_all("a", href=True):
            href = link.get("href", "").lower()
            for pattern in ["/blog", "/articles", "/news", "/posts", "/insights", "/stories"]:
                if pattern in href:
                    content_paths.append(link.get("href"))
                    break
        
        content_paths = list(set(content_paths))[:5]
        
        # Try to extract articles from homepage and content sections
        all_articles = scraper.extract_articles(url, html)
        
        for path in content_paths:
            section_url = urljoin(url, path)
            section_html = await scraper.fetch(section_url, client)
            if section_html:
                articles = scraper.extract_articles(section_url, section_html)
                all_articles.extend(articles)
        
        return {
            "domain": domain,
            "status": "ok",
            "content_paths": content_paths,
            "articles_found": len(all_articles),
            "sample_articles": all_articles[:5],
        }


async def test_scraper():
    """Test content scraper on sample sites."""
    test_sites = [
        "medium.com",
        "substack.com",
        "hashnode.com",
        "dev.to",
    ]
    
    for domain in test_sites:
        print(f"\n🕷️  Scraping {domain}...")
        result = await discover_site_content(domain)
        print(f"  Status: {result['status']}")
        if result['status'] == 'ok':
            print(f"  Articles found: {result['articles_found']}")
            for article in result['sample_articles'][:2]:
                print(f"    - {article['title'][:60]}")


if __name__ == "__main__":
    asyncio.run(test_scraper())
