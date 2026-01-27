import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const alt = "Video";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  let video: {
    title: string;
    coverUrl: string | null;
    uploader: { nickname: string | null; username: string };
  } | null = null;

  try {
    video = await prisma.video.findUnique({
      where: { id },
      select: {
        title: true,
        coverUrl: true,
        uploader: { select: { nickname: true, username: true } },
      },
    });
  } catch {
    // 数据库不可用时返回默认图片
  }

  if (!video) {
    return new ImageResponse(
      (
        <div
          style={{
            fontSize: 48,
            background: "linear-gradient(to bottom right, #1a1a2e, #16213e)",
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
          }}
        >
          ACGN Flow
        </div>
      ),
      { ...size }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 32,
          background: "linear-gradient(to bottom right, #1a1a2e, #16213e)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 60,
          color: "white",
        }}
      >
        {video.coverUrl && (
          <img
            src={video.coverUrl}
            alt=""
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.3,
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            flex: 1,
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: "bold",
              marginBottom: 20,
              lineHeight: 1.2,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {video.title}
          </div>
          <div style={{ fontSize: 24, opacity: 0.8 }}>
            {video.uploader.nickname || video.uploader.username} · ACGN Flow
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
