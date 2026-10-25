import { db } from "@/db";
import * as schema from "@/db/schema";

export async function GET() {
  const baseUrl = process.env.APP_URL || "https://af.saop.cc";
  const now = new Date().toISOString();

  try {
    const tags = await db.select({ slug: schema.tag.slug }).from(schema.tag).limit(1000);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${tags
  .map(
    (tag) => `  <url>
    <loc>${baseUrl}/tag/${tag.slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Tags sitemap error:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      {
        headers: { "Content-Type": "application/xml" },
      },
    );
  }
}
