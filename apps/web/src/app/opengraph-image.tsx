import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  const logoData = await readFile(
    join(process.cwd(), "public", "assets", "logo.png"),
  );
  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f5f3ff 0%, #eef2ff 100%)",
      }}
    >
      <img src={logoSrc} width={140} height={140} />
      <div
        style={{
          display: "flex",
          fontSize: 80,
          fontWeight: 800,
          color: "#111827",
          marginTop: 16,
        }}
      >
        Serendip <span style={{ color: "#7c3aed", marginLeft: 20 }}>Bot</span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 32,
          color: "#6b7280",
          marginTop: 16,
        }}
      >
        Discover the internet you didn&apos;t know existed.
      </div>
    </div>,
    size,
  );
}
