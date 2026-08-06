import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Browser-tab favicon - same placeholder monogram as manifest icons, see src/app/api/pwa/icon/route.tsx for the swap-in note. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#3366FF", color: "white", fontSize: 20, fontWeight: 700, fontFamily: "sans-serif" }}>
        KP
      </div>
    ),
    { ...size }
  );
}
