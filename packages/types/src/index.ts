// ─── Discovery ───────────────────────────────────────────────────────────────

export type Mood =
  | "learn"
  | "create"
  | "laugh"
  | "wonder"
  | "chill"
  | "explore"
  | "relax"
  | "inspire"
  | "challenge";

export type FeedbackSignal = "love" | "skip" | "block";

export type DiscoveryJobStatus =
  | "pending"
  | "processing"
  | "complete"
  | "failed";

export interface DiscoverySite {
  id: string;
  url: string;
  title: string;
  description: string;
  contentSummary: string;
  extractedImages: ExtractedImage[];
  qualityScore: number;
  categories: string[];
  whyBlurb: string;
  position: number;
}

export interface ExtractedImage {
  url: string;
  altText: string;
}

export interface DiscoveryRequest {
  sessionId: string;
  mood?: Mood;
  topics?: string[];
}

export interface DiscoveryResult {
  jobId: string;
  status: DiscoveryJobStatus;
  sites: DiscoverySite[];
  completedAt?: string;
}

// ─── Curiosity Profile ───────────────────────────────────────────────────────

export type TopicWeights = Record<string, number>;

export interface MoodHistoryEntry {
  mood: Mood;
  at: string;
  siteId: string;
}

export interface CuriosityProfile {
  id: string;
  sessionId: string;
  userId?: string;
  topicWeights: TopicWeights;
  moodHistory: MoodHistoryEntry[];
  updatedAt: string;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  userId?: string;
  createdAt: string;
  expiresAt: string;
  lastActiveAt: string;
}
// ─── Articles ────────────────────────────────────────────────────────────────

export interface ArticleImage {
  url: string;
  altText: string;
  caption?: string;
  credit?: string;
}

export interface ArticleSection {
  heading: string;
  paragraphs: string[];
  image?: ArticleImage & { float?: "right" };
  blockquote?: { text: string; cite?: string };
  callout?: { label: string; text: string };
}

export interface Article {
  slug: string;
  title: string;
  subtitle?: string;
  emoji: string;
  publishedAt: string;
  readingTime: string;
  heroImage: ArticleImage;
  keyFacts: string[];
  sections: ArticleSection[];
  sources: Array<{ title: string; url: string }>;
}

export interface ArticleListItem {
  slug: string;
  title: string;
  subtitle?: string;
  emoji: string;
  publishedAt: string;
  readingTime: string;
  heroImage: ArticleImage;
}
// ─── API Responses ───────────────────────────────────────────────────────────

export interface ApiError {
  code: string;
  message: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
  total?: number;
}
