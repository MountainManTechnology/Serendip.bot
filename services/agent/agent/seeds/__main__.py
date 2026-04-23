"""Entry point for cron: python -m agent.seeds.refresh"""

import asyncio

from agent.seeds import refresh

if __name__ == "__main__":
    asyncio.run(refresh())
