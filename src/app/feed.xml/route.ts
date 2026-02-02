import { prisma } from "@/lib/prisma";

// 强制动态渲染，避免构建时预渲染（此时数据库不可用）
export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  // 格式化时长为 ISO 8601 格式
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  };

  let rssItems = "";

  try {
    const videos = await prisma.video.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        uploader: { select: { username: true, nickname: true } },
        tags: { include: { tag: { select: { name: true } } } },
      },
    });

    rssItems = videos
      .map(
        (video) => `
    <item>
      <title>${escapeXml(video.title)}</title>
      <link>${baseUrl}/video/${video.id}</link>
      <guid isPermaLink="true">${baseUrl}/video/${video.id}</guid>
      <description><![CDATA[${video.description || video.title}]]></description>
      <pubDate>${new Date(video.createdAt).toUTCString()}</pubDate>
      <author>${escapeXml(video.uploader.nickname || video.uploader.username)}</author>
      ${video.tags.map((t) => `<category>${escapeXml(t.tag.name)}</category>`).join("\n      ")}
      ${video.coverUrl ? `<media:thumbnail url="${escapeXml(video.coverUrl)}" />` : ""}
      ${video.coverUrl ? `<media:content url="${escapeXml(video.videoUrl)}" type="video/mp4" medium="video"${video.duration ? ` duration="${video.duration}"` : ""}>
        <media:title type="plain">${escapeXml(video.title)}</media:title>
        <media:description type="plain"><![CDATA[${video.description || ""}]]></media:description>
        ${video.coverUrl ? `<media:thumbnail url="${escapeXml(video.coverUrl)}" />` : ""}
        <media:credit role="author">${escapeXml(video.uploader.nickname || video.uploader.username)}</media:credit>
        <media:statistics views="${video.views}" />
      </media:content>` : ""}
      ${video.duration ? `<itunes:duration>${formatDuration(video.duration)}</itunes:duration>` : ""}
    </item>`
      )
      .join("");
  } catch {
    // 数据库不可用时返回空的 feed
    console.warn("Feed: Database unavailable, returning empty feed");
  }

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(siteName)}</title>
    <link>${baseUrl}</link>
    <description>ACGN Fans 流式媒体内容分享平台，分享动画、漫画、游戏、轻小说相关视频内容</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${baseUrl}/icon</url>
      <title>${escapeXml(siteName)}</title>
      <link>${baseUrl}</link>
    </image>
    <itunes:author>${escapeXml(siteName)}</itunes:author>
    <itunes:summary>ACGN Fans 流式媒体内容分享平台</itunes:summary>
    <itunes:category text="Leisure">
      <itunes:category text="Animation &amp; Manga"/>
    </itunes:category>
    ${rssItems}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
