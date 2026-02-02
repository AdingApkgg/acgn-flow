import { NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";
  const now = new Date().toISOString();

  const urls = [
    { loc: baseUrl, changefreq: "daily", priority: "1.0" },
    { loc: `${baseUrl}/tags`, changefreq: "weekly", priority: "0.8" },
    { loc: `${baseUrl}/search`, changefreq: "weekly", priority: "0.7" },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
