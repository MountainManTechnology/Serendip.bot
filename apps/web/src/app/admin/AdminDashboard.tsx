"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";

type SiteRow = {
  id: string;
  url: string;
  title: string | null;
  loveCount: number;
  skipCount: number;
  blockCount: number;
};

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-1">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
        {label}
      </p>
      <p className="text-4xl font-bold text-[#0f0d1a]">
        {value.toLocaleString()}
      </p>
      {sub && <p className="text-sm text-gray-500">{sub}</p>}
    </div>
  );
}

function SiteTable({
  rows,
  countKey,
  label,
}: {
  rows: SiteRow[];
  countKey: keyof SiteRow;
  label: string;
}) {
  const filtered = rows.filter((r) => (r[countKey] as number) > 0);
  if (filtered.length === 0)
    return <p className="text-sm text-gray-400">No data yet.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="px-4 py-3 font-semibold text-gray-500 w-8">#</th>
            <th className="px-4 py-3 font-semibold text-gray-500">Site</th>
            <th className="px-4 py-3 font-semibold text-gray-500 text-right">
              {label}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {filtered.map((row, i) => (
            <tr key={row.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-gray-400">{i + 1}</td>
              <td className="px-4 py-3">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#7b5ea7] hover:underline line-clamp-1"
                >
                  {row.title ?? row.url}
                </a>
                <p className="text-xs text-gray-400 truncate max-w-xs">
                  {row.url}
                </p>
              </td>
              <td className="px-4 py-3 text-right font-bold text-[#0f0d1a]">
                {(row[countKey] as number).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminDashboard() {
  const { data, isLoading, error } = trpc.admin.getStats.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Loading stats…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        Error: {error.message}
      </div>
    );
  }

  if (!data) return null;

  const totalFeedback = data.feedback.total;
  const lovePct =
    totalFeedback > 0
      ? Math.round((data.feedback.love / totalFeedback) * 100)
      : 0;
  const skipPct =
    totalFeedback > 0
      ? Math.round((data.feedback.skip / totalFeedback) * 100)
      : 0;
  const blockPct =
    totalFeedback > 0
      ? Math.round((data.feedback.block / totalFeedback) * 100)
      : 0;
  // Prefer seconds value if provided by the API; fall back to ms -> s conversion
  const avgIngestDurationSec = Number(
    (
      data.ingestion.lastHour?.avgDurationSec ??
      (data.ingestion.lastHour?.avgDurationMs ?? 0) / 1000
    ).toFixed(2),
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0f0d1a]">Admin Dashboard</h1>
          <p className="text-xs text-gray-400">
            Serendip.bot — Live Statistics
          </p>
        </div>
        <Link href="/" className="text-sm text-[#7b5ea7] hover:underline">
          ← Back to site
        </Link>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        {/* Overview stats */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
            Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Active (24h)"
              value={data.sessions.activeLast24h}
              sub="unique sessions"
            />
            <StatCard label="Indexed Sites" value={data.sites.total} />
            <StatCard
              label="Avg Quality"
              value={data.sites.avgQualityScore.toFixed(2)}
              sub="(0-1 scale)"
            />
            <StatCard label="Total Feedback" value={data.feedback.total} />
          </div>
        </section>

        {/* Feedback breakdown */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
            Feedback Breakdown
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-rose-100 p-6 shadow-sm space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-rose-400">
                ❤️ Loves
              </p>
              <p className="text-4xl font-bold text-rose-500">
                {data.feedback.love.toLocaleString()}
              </p>
              <p className="text-sm text-gray-400">
                {lovePct}% of all feedback
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                → Skips
              </p>
              <p className="text-4xl font-bold text-gray-600">
                {data.feedback.skip.toLocaleString()}
              </p>
              <p className="text-sm text-gray-400">
                {skipPct}% of all feedback
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-red-100 p-6 shadow-sm space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-red-400">
                ✕ Blocks
              </p>
              <p className="text-4xl font-bold text-red-500">
                {data.feedback.block.toLocaleString()}
              </p>
              <p className="text-sm text-gray-400">
                {blockPct}% of all feedback
              </p>
            </div>
          </div>
        </section>

        {/* Ingestion metrics */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
            Ingestion
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <StatCard
              label="Pending Ingests"
              value={data.ingestion.pending}
              sub="pending attempts"
            />
            <StatCard
              label="Ingests (1h)"
              value={data.ingestion.lastHour.successCount}
              sub="successful batches last hour"
            />
            <StatCard
              label="Avg Ingest Duration"
              value={avgIngestDurationSec}
              sub="s avg (last hour)"
            />
            <StatCard
              label="Failed (1h)"
              value={data.ingestion.lastHour.failureCount ?? 0}
              sub="failed batches last hour"
            />
            <StatCard
              label="Avg Retries (1h)"
              value={data.ingestion.lastHour.avgRetries ?? 0}
              sub="avg retries per batch"
            />
            <StatCard
              label="Eval Concurrency"
              value={data.ingestion.evalConcurrency ?? "unknown"}
              sub="current (Redis)"
            />
          </div>
        </section>

        {/* Sites indexed by mood */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
            Sites Indexed by Mood
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(data.sites.perMood).length > 0 ? (
              Object.entries(data.sites.perMood)
                .sort(([, a], [, b]) => b - a)
                .map(([mood, count]) => (
                  <div
                    key={mood}
                    className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm space-y-1"
                  >
                    <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
                      {mood === "unspecified"
                        ? "No Mood"
                        : mood.charAt(0).toUpperCase() + mood.slice(1)}
                    </p>
                    <p className="text-3xl font-bold text-blue-600">
                      {count.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400">
                      {data.discovery.sessionsPerMood[mood]
                        ? `${data.discovery.sessionsPerMood[mood]} sessions`
                        : "0 sessions"}
                    </p>
                  </div>
                ))
            ) : (
              <p className="text-sm text-gray-400 col-span-full">
                No mood data available yet.
              </p>
            )}
          </div>
        </section>

        {/* Content type distribution */}
        {Object.keys(data.sites.contentTypes).length > 0 && (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
              Content Type Distribution
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(data.sites.contentTypes)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div
                    key={type}
                    className="bg-white rounded-2xl border border-purple-100 p-4 shadow-sm space-y-1"
                  >
                    <p className="text-xs font-semibold uppercase tracking-widest text-purple-400">
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </p>
                    <p className="text-3xl font-bold text-purple-600">
                      {count.toLocaleString()}
                    </p>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Top sites tables */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
            Top Loved Sites
          </h2>
          <SiteTable
            rows={data.topLoved}
            countKey="loveCount"
            label="❤️ Loves"
          />
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
            Top Skipped Sites
          </h2>
          <SiteTable
            rows={data.topSkipped}
            countKey="skipCount"
            label="→ Skips"
          />
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">
            Top Blocked Sites
          </h2>
          <SiteTable
            rows={data.topBlocked}
            countKey="blockCount"
            label="✕ Blocks"
          />
        </section>
      </main>
    </div>
  );
}
