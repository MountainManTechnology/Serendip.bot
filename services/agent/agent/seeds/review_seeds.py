#!/usr/bin/env python3
"""Review and display discovery seeds YAML files."""

import json
from pathlib import Path

import yaml

SEEDS_DIR = Path(__file__).parent

categories = [
    "science", "culture", "technology", "design", 
    "health", "food", "nature", "humor", "travel",
    "general", "philosophy", "history", "gaming"
]


def load_seeds(category: str) -> dict:
    """Load seed file for a category."""
    seed_file = SEEDS_DIR / f"{category}.yaml"
    if not seed_file.exists():
        return {"topic": category, "urls": []}
    
    with open(seed_file) as f:
        return yaml.safe_load(f) or {"topic": category, "urls": []}


def display_seeds(category: str):
    """Pretty print seeds for a category."""
    data = load_seeds(category)
    urls = data.get("urls", [])
    description = data.get("description", "")
    
    print(f"\n{'='*70}")
    print(f"📚 {category.upper()}")
    print(f"{'='*70}")
    if description:
        print(f"Description: {description}")
    print(f"Feed count: {len(urls)}\n")
    
    for i, url in enumerate(urls, 1):
        print(f"{i:2}. {url}")


def summary():
    """Show summary of all seeds."""
    print("\n" + "="*70)
    print("DISCOVERY SEEDS SUMMARY")
    print("="*70 + "\n")
    
    total_urls = 0
    for category in categories:
        data = load_seeds(category)
        urls = data.get("urls", [])
        total_urls += len(urls)
        status = "✓" if urls else "✗"
        print(f"{status} {category:15} → {len(urls):3} feeds")
    
    print(f"\n{'='*70}")
    print(f"TOTAL: {total_urls} candidate feeds across {len(categories)} categories")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        category = sys.argv[1]
        if category in categories:
            display_seeds(category)
        else:
            print(f"Unknown category: {category}")
            print(f"Available: {', '.join(categories)}")
    else:
        summary()
        print("\nUsage:")
        print(f"  python review_seeds.py              # Show summary")
        print(f"  python review_seeds.py science      # Show science feeds")
        print(f"  python review_seeds.py all          # Show all categories\n")
