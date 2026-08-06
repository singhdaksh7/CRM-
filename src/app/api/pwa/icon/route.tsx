import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Phase 4, Objective 14 - PWA icon generation. No real app icon artwork
 * exists yet (confirmed decision: placeholder now, documented swap-in
 * point for real artwork later). Renders the same "KP" monogram-on-brand-
 * blue treatment as the login page badge, at whatever size the manifest
 * requests via ?size=. A stable, self-controlled URL (unlike relying on
 * icon.tsx's auto-generated path format, which isn't verifiable without a
 * browser in this environment) - referenced directly from manifest.ts.
 *
 * TO SWAP IN REAL ARTWORK: replace this route's ImageResponse with a
 * static image read (or an `icon.png`/`apple-icon.png` file convention),
 * and update manifest.ts's icon src values accordingly.
 */
export async function GET(req: NextRequest) {
  const sizeParam = Number(req.nextUrl.searchParams.get("size"));
  const size = Number.isFinite(sizeParam) && sizeParam > 0 ? Math.min(sizeParam, 1024) : 512;
  const maskable = req.nextUrl.searchParams.get("maskable") === "true";
  // Maskable icons need padding so the monogram survives OS-level circular/
  // squircle cropping - a "safe zone" of roughly 80% of the canvas.
  const fontSize = maskable ? size * 0.32 : size * 0.42;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#3366FF",
          borderRadius: maskable ? 0 : size * 0.22,
          color: "white",
          fontSize,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        KP
      </div>
    ),
    { width: size, height: size }
  );
}
