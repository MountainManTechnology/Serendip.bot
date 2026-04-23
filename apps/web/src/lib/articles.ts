import type { ArticleListItem } from "@serendip-bot/types";
import { fetchContentApiJson } from "@/lib/content-api";

export const DAILY_DISCOVERIES_PAGE_SIZE = 12;
const DAILY_DISCOVERIES_REVALIDATE_SECONDS = 1800;

export interface ArticlesResponse {
  articles: ArticleListItem[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getArticles(page: number): Promise<ArticlesResponse> {
  const data = await fetchContentApiJson<ArticlesResponse>(
    `/api/articles?page=${page}&limit=${DAILY_DISCOVERIES_PAGE_SIZE}`,
    {
      next: { revalidate: DAILY_DISCOVERIES_REVALIDATE_SECONDS },
    },
  );

  if (!data) {
    return { articles: [], total: 0, page: 1, totalPages: 0 };
  }

  return data;
}

export async function getLatestDailyDiscovery(): Promise<ArticleListItem | null> {
  const data = await getArticles(1);
  return data.articles[0] ?? null;
}

export function articleUrl(article: ArticleListItem): string {
  const date = new Date(article.publishedAt + "T00:00:00Z");
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `/articles/${year}/${month}/${article.slug}`;
}
