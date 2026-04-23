import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Redis from "ioredis";
import { db } from "@/lib/db";
import { sql } from "@serendip-bot/db";
import { isValidAdminSessionToken } from "@/lib/admin-session";

export const revalidate = 60;

export const metadata = { title: "Metrics — Serendip.bot Admin" };

// ─── Redis helpers ────────────────────────────────────────────────────────
async function getRedisMetrics(): Promise<{
  workerCount: number;
  workerIds: string[];
  queueDepth: number;
  dlqDepth: number;
}> {
  const client = new Redis(
    process.env["REDIS_URL"] ?? "redis://localhost:6379",
    {
      lazyConnect: true,
      connectTimeout: 3000,
      commandTimeout: 3000,
    },
  );
  try {
    await client.connect();
    const [workerKeys, queueDepth, dlqDepth] = await Promise.all([
      client.keys("metrics:worker:alive:*"),
      client.llen("metrics:events"),
      client.llen("metrics:events:dlq"),
    ]);
    return {
      workerCount: workerKeys.length,
      workerIds: workerKeys.map((k) => k.replace("metrics:worker:alive:", "")),
      queueDepth,
      dlqDepth,
    };
  } catch {
    return { workerCount: 0, workerIds: [], queueDepth: 0, dlqDepth: 0 };
  } finally {
    client.disconnect();
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default async function MetricsDashboard() {
  const cookieStore = await cookies();
  const adminSession = cookieStore.get("admin_session")?.value;
  const secret = process.env.ADMIN_SECRET_KEY;

  if (!secret || !isValidAdminSessionToken(adminSession, secret)) {
    redirect("/admin/login");
  }

  // Postgres queries
  const [
    concurrentResult,
    dailyTodayResult,
    llmCostResult,
    dailySummaryResult,
  ] = await Promise.allSettled([
    db.execute(sql`SELECT * FROM metrics.current_concurrent LIMIT 1`),
    db.execute(
      sql`SELECT * FROM metrics.daily_summary WHERE day = CURRENT_DATE LIMIT 1`,
    ),
    db.execute(
      sql`SELECT day, model, provider, call_type, calls,
                   total_prompt_tokens, total_completion_tokens,
                   ROUND(total_cost_usd::numeric, 4) AS total_cost_usd,
                   users_charged
            FROM metrics.daily_llm_cost
            WHERE day >= CURRENT_DATE - INTERVAL '7 days'
            ORDER BY day DESC, total_cost_usd DESC
            LIMIT 50`,
    ),
    db.execute(
      sql`SELECT day, daily_sessions, daily_users, total_requests,
                   ROUND(avg_response_ms::numeric, 0) AS avg_response_ms,
                   ROUND(p95_response_ms::numeric, 0) AS p95_response_ms,
                   errors_5xx, countries
            FROM metrics.daily_summary
            ORDER BY day DESC
            LIMIT 7`,
    ),
  ]);

  const concurrent =
    concurrentResult.status === "fulfilled"
      ? ((concurrentResult.value.rows[0] as Record<string, unknown>) ?? {})
      : {};
  const dailyToday =
    dailyTodayResult.status === "fulfilled"
      ? ((dailyTodayResult.value.rows[0] as Record<string, unknown>) ?? {})
      : {};
  const llmRows =
    llmCostResult.status === "fulfilled"
      ? (llmCostResult.value.rows as Record<string, unknown>[])
      : [];
  const dailyRows =
    dailySummaryResult.status === "fulfilled"
      ? (dailySummaryResult.value.rows as Record<string, unknown>[])
      : [];

  const todayLlmSpend = llmRows
    .filter((r) => {
      const d = r["day"];
      return d && String(d).startsWith(new Date().toISOString().slice(0, 10));
    })
    .reduce((sum, r) => sum + Number(r["total_cost_usd"] ?? 0), 0);

  const redisMetrics = await getRedisMetrics();

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 1100,
        margin: "0 auto",
        padding: "2rem 1rem",
      }}
    >
      <h1
        style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}
      >
        Metrics Dashboard
      </h1>
      <p style={{ color: "#888", fontSize: "0.8rem", marginBottom: "2rem" }}>
        Refreshes every 60 seconds · Data from materialized views
      </p>

      {/* ── Summary tiles ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <Tile
          label="Concurrent sessions (5 min)"
          value={String(concurrent["concurrent_sessions"] ?? "—")}
        />
        <Tile
          label="Daily uniques (today)"
          value={String(dailyToday["daily_users"] ?? "—")}
        />
        <Tile
          label="p95 latency today"
          value={
            dailyToday["p95_response_ms"]
              ? `${dailyToday["p95_response_ms"]}ms`
              : "—"
          }
        />
        <Tile
          label="LLM spend today"
          value={`$${todayLlmSpend.toFixed(4)}`}
          sub="budget: $0.05–0.10/user"
        />
      </div>

      {/* ── Live status ── */}
      <h2
        style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}
      >
        Live status
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <Tile
          label="Live workers"
          value={String(redisMetrics.workerCount)}
          sub={redisMetrics.workerIds.join(", ") || "none"}
          color={
            redisMetrics.workerCount >= 2
              ? "green"
              : redisMetrics.workerCount === 1
                ? "orange"
                : "red"
          }
        />
        <Tile
          label="Telemetry queue depth"
          value={String(redisMetrics.queueDepth)}
          sub="metrics:events"
        />
        <Tile
          label="DLQ depth"
          value={String(redisMetrics.dlqDepth)}
          sub="metrics:events:dlq"
          color={redisMetrics.dlqDepth > 0 ? "orange" : undefined}
        />
      </div>

      {/* ── LLM cost table ── */}
      <h2
        style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}
      >
        LLM cost — last 7 days
      </h2>
      {llmRows.length === 0 ? (
        <p style={{ color: "#888", marginBottom: "2rem" }}>No data yet.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginBottom: "2rem",
            fontSize: "0.85rem",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #ddd", textAlign: "left" }}>
              {[
                "Day",
                "Model",
                "Provider",
                "Type",
                "Calls",
                "Tokens In",
                "Tokens Out",
                "Cost USD",
              ].map((h) => (
                <th
                  key={h}
                  style={{ padding: "0.4rem 0.6rem", fontWeight: 600 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {llmRows.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {String(row["day"]).slice(0, 10)}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {String(row["model"])}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {String(row["provider"])}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {String(row["call_type"])}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {String(row["calls"])}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {Number(row["total_prompt_tokens"]).toLocaleString()}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {row["total_completion_tokens"] != null
                    ? Number(row["total_completion_tokens"]).toLocaleString()
                    : "—"}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  ${Number(row["total_cost_usd"]).toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Daily request summary ── */}
      <h2
        style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}
      >
        Daily requests — last 7 days
      </h2>
      {dailyRows.length === 0 ? (
        <p style={{ color: "#888" }}>No data yet.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.85rem",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #ddd", textAlign: "left" }}>
              {[
                "Day",
                "Sessions",
                "Users",
                "Requests",
                "Avg ms",
                "p95 ms",
                "5xx",
                "Countries",
              ].map((h) => (
                <th
                  key={h}
                  style={{ padding: "0.4rem 0.6rem", fontWeight: 600 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dailyRows.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {String(row["day"]).slice(0, 10)}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {String(row["daily_sessions"] ?? "—")}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {String(row["daily_users"] ?? "—")}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {Number(row["total_requests"] ?? 0).toLocaleString()}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {String(row["avg_response_ms"] ?? "—")}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {String(row["p95_response_ms"] ?? "—")}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {String(row["errors_5xx"] ?? "0")}
                </td>
                <td style={{ padding: "0.4rem 0.6rem" }}>
                  {String(row["countries"] ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  color?: string | undefined;
}) {
  return (
    <div
      style={{
        background: "#f9f9f9",
        borderRadius: 8,
        padding: "1rem",
        borderLeft: color ? `4px solid ${color}` : undefined,
      }}
    >
      <div
        style={{ fontSize: "0.75rem", color: "#666", marginBottom: "0.25rem" }}
      >
        {label}
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{value}</div>
      {sub && (
        <div
          style={{ fontSize: "0.7rem", color: "#999", marginTop: "0.25rem" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
