import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ADMIN_SESSION_VERSION = "v1";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24;

interface AdminSessionPayload {
  exp: number;
  iat: number;
  nonce: string;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

export function createAdminSessionToken(
  secret: string,
  now = Date.now(),
  ttlSeconds = ADMIN_SESSION_TTL_SECONDS,
): string {
  const payload: AdminSessionPayload = {
    exp: now + ttlSeconds * 1000,
    iat: now,
    nonce: randomBytes(16).toString("hex"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = signPayload(encodedPayload, secret);
  return `${ADMIN_SESSION_VERSION}.${encodedPayload}.${signature}`;
}

export function isValidAdminSessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token) return false;

  const [version, encodedPayload, signature] = token.split(".");
  if (!version || !encodedPayload || !signature) return false;
  if (version !== ADMIN_SESSION_VERSION) return false;

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!safeCompare(signature, expectedSignature)) return false;

  let payload: AdminSessionPayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as AdminSessionPayload;
  } catch {
    return false;
  }

  return (
    typeof payload.exp === "number" &&
    typeof payload.iat === "number" &&
    typeof payload.nonce === "string" &&
    payload.nonce.length >= 16 &&
    payload.exp > now &&
    payload.iat <= now
  );
}

export const adminSessionTtlSeconds = ADMIN_SESSION_TTL_SECONDS;
