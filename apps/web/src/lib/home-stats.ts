import { fetchContentApiJson } from "@/lib/content-api";

export const DISCOVERY_MOOD_COUNT = 9;

interface PublicStatsResponse {
  indexedSiteCount: number;
}

export async function getIndexedSiteCount(): Promise<number | null> {
  const data = await fetchContentApiJson<PublicStatsResponse>(
    "/api/public/stats",
    {
      next: { revalidate: 1800 },
    },
  );

  return data?.indexedSiteCount ?? null;
}
