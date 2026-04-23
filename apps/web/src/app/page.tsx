import type { ArticleListItem } from "@serendip-bot/types";
import { LandingPageClient } from "@/components/home/LandingPageClient";
import { getLatestDailyDiscovery } from "@/lib/articles";
import { DISCOVERY_MOOD_COUNT, getIndexedSiteCount } from "@/lib/home-stats";

export default async function LandingPage() {
  const [latestArticle, indexedSiteCount]: [
    ArticleListItem | null,
    number | null,
  ] = await Promise.all([getLatestDailyDiscovery(), getIndexedSiteCount()]);

  return (
    <LandingPageClient
      latestArticle={latestArticle}
      indexedSiteCount={indexedSiteCount}
      moodCount={DISCOVERY_MOOD_COUNT}
    />
  );
}
