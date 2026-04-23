import { describe, expect, it } from "vitest";
import {
  adminSessionTtlSeconds,
  createAdminSessionToken,
  isValidAdminSessionToken,
} from "./admin-session.js";

describe("admin session token", () => {
  const secret = "test-admin-secret";
  const now = Date.UTC(2026, 3, 22, 12, 0, 0);

  it("creates a token that is not the raw secret", () => {
    const token = createAdminSessionToken(secret, now);
    expect(token).not.toBe(secret);
    expect(token.startsWith("v1.")).toBe(true);
  });

  it("accepts a fresh valid token", () => {
    const token = createAdminSessionToken(secret, now);
    expect(isValidAdminSessionToken(token, secret, now + 1_000)).toBe(true);
  });

  it("rejects expired tokens", () => {
    const token = createAdminSessionToken(secret, now, 1);
    expect(isValidAdminSessionToken(token, secret, now + 2_000)).toBe(false);
  });

  it("rejects tampered signatures", () => {
    const token = createAdminSessionToken(secret, now);
    const tampered = token.replace(/\.[^.]+$/, ".tampered");
    expect(isValidAdminSessionToken(tampered, secret, now + 1_000)).toBe(false);
  });

  it("uses the default one-day ttl", () => {
    const token = createAdminSessionToken(secret, now);
    expect(
      isValidAdminSessionToken(
        token,
        secret,
        now + adminSessionTtlSeconds * 1000 - 1,
      ),
    ).toBe(true);
    expect(
      isValidAdminSessionToken(
        token,
        secret,
        now + adminSessionTtlSeconds * 1000 + 1,
      ),
    ).toBe(false);
  });
});
