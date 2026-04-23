"use client";

import { useEffect } from "react";

const SESSION_COOKIE = "stumble_session";
const SESSION_DURATION_DAYS = 30;

/**
 * Reads the stumble_session cookie value from the browser.
 */
export function getSessionId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

/**
 * Writes a stumble_session cookie with a 30-day expiry.
 * SameSite=Lax — appropriate for anonymous first-party sessions.
 */
export function setSessionId(id: string): void {
  if (typeof document === "undefined") return;
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DURATION_DAYS);
  document.cookie = [
    `${SESSION_COOKIE}=${encodeURIComponent(id)}`,
    `expires=${expires.toUTCString()}`,
    "path=/",
    "SameSite=Lax",
    // Only set Secure in production (HTTPS)
    ...(location.protocol === "https:" ? ["Secure"] : []),
  ].join("; ");
}

/**
 * Hook that persists a sessionId returned from the API into the browser cookie.
 * Call this after a discovery.request mutation returns.
 */
export function usePersistSession(sessionId: string | undefined): void {
  useEffect(() => {
    if (!sessionId) return;
    const existing = getSessionId();
    if (!existing) {
      setSessionId(sessionId);
    }
  }, [sessionId]);
}
