import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 72,
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          borderRadius: 36,
        }}
      >
        <span style={{ fontWeight: "bold" }}>A</span>
        <span style={{ fontSize: 24, color: "#8b5cf6", marginTop: -8 }}>Flow</span>
      </div>
    ),
    { ...size }
  );
}
