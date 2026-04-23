import { timingSafeEqual } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import {
  adminSessionTtlSeconds,
  createAdminSessionToken,
} from "@/lib/admin-session";

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Admin not configured" },
      { status: 500 },
    );
  }

  let key: string | undefined;
  try {
    const body = (await req.json()) as { key?: string };
    key = body.key;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const keyBuf = Buffer.from(key ?? "");
  const secretBuf = Buffer.from(secret);
  const isValid =
    !!key &&
    keyBuf.length === secretBuf.length &&
    timingSafeEqual(keyBuf, secretBuf);

  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });

  // Derive the cookie domain from NEXT_PUBLIC_SITE_URL (baked at build time).
  // This is reliable behind a reverse proxy (Caddy/AFD) where the Host header
  // is the internal origin hostname, not the public-facing domain.
  // Falls back to the Host header for local dev where NEXT_PUBLIC_SITE_URL is unset.
  function getCookieDomain(): string | undefined {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const hostname = siteUrl
      ? (() => {
          try {
            return new URL(siteUrl).hostname;
          } catch {
            return null;
          }
        })()
      : (req.headers.get("host") ?? "").split(":")[0];

    if (!hostname || hostname === "localhost" || /^\d/.test(hostname))
      return undefined;
    const parts = hostname.split(".");
    if (parts.length <= 2) return undefined;
    return "." + parts.slice(1).join(".");
  }

  // Use the request origin to determine if we're on HTTPS rather than NODE_ENV,
  // since the Dockerfile sets NODE_ENV=production even for local Docker dev.
  const requestProto =
    req.headers.get("x-forwarded-proto") ??
    (req.nextUrl.protocol === "https:" ? "https" : "http");
  const isSecureRequest = requestProto === "https";

  res.cookies.set("admin_session", createAdminSessionToken(secret), {
    httpOnly: true,
    secure: isSecureRequest,
    sameSite: "lax",
    path: "/",
    maxAge: adminSessionTtlSeconds,
    domain: getCookieDomain(),
  });
  return res;
}
