const API_URL =
  process.env["API_INTERNAL_URL"] ??
  process.env["NEXT_PUBLIC_API_URL"] ??
  "http://localhost:4000";

export async function fetchContentApiJson<T>(
  path: string,
  init?: Parameters<typeof fetch>[1],
): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
