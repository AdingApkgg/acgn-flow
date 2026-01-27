import { prisma } from "@/lib/prisma";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";

  const videos = await prisma.video.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      uploader: { select: { username: true, nickname: true } },
      category: { select: { name: true } },
    },
  });

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const rssItems = videos
    .map(
      (video) => `
    <item>
      <title>${escapeXml(video.title)}</title>
      <link>${baseUrl}/video/${video.id}</link>
      <guid isPermaLink="true">${baseUrl}/video/${video.id}</guid>
      <description>${escapeXml(video.description || "")}</description>
      <pubDate>${new Date(video.createdAt).toUTCString()}</pubDate>
      <author>${escapeXml(video.uploader.nickname || video.uploader.username)}</author>
      ${video.category ? `<category>${escapeXml(video.category.name)}</category>` : ""}
      ${video.coverUrl ? `<enclosure url="${escapeXml(video.coverUrl)}" type="image/jpeg" />` : ""}
    </item>`
    )
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteName)}</title>
    <link>${baseUrl}</link>
    <description>ACGN Fans 流式媒体内容分享平台</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml" />
    ${rssItems}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
