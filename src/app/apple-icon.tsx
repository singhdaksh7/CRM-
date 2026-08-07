import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon - iOS Safari doesn't honor the manifest's `display: standalone` alone, it needs this file plus the apple-mobile-web-app meta tags in layout.tsx. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#3366FF", color: "white", fontSize: 76, fontWeight: 700, fontFamily: "sans-serif" }}>
        KP
      </div>
    ),
    { ...size }
  );
}
