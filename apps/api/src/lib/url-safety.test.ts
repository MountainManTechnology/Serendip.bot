import dns from "node:dns/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSafePublicFetchUrl, isSafePublicUrl } from "./url-safety.js";

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(),
  },
}));

describe("url safety", () => {
  beforeEach(() => {
    vi.mocked(dns.lookup).mockReset();
  });

  it("rejects non-http protocols", () => {
    expect(isSafePublicUrl("javascript:alert(1)")).toBe(false);
    expect(isSafePublicUrl("data:text/html,hi")).toBe(false);
  });

  it("rejects obvious local targets", () => {
    expect(isSafePublicUrl("http://localhost:4000")).toBe(false);
    expect(isSafePublicUrl("http://127.0.0.1:4000")).toBe(false);
    expect(
      isSafePublicUrl("https://192.168.1.10/image.png", { requireHttps: true }),
    ).toBe(false);
  });

  it("allows public web urls", () => {
    expect(isSafePublicUrl("https://example.com/article")).toBe(true);
    expect(isSafePublicUrl("http://example.com/article")).toBe(true);
    expect(
      isSafePublicUrl("http://example.com/article", { requireHttps: true }),
    ).toBe(false);
  });

  it("rejects DNS resolutions to private addresses", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ] as never);

    await expect(
      isSafePublicFetchUrl("https://internal.example/image.png"),
    ).resolves.toBe(false);
  });

  it("allows DNS resolutions to public addresses", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);

    await expect(
      isSafePublicFetchUrl("https://example.com/image.png"),
    ).resolves.toBe(true);
  });
});
