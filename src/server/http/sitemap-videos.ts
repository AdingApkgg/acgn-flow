import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export async function GET() {
  const baseUrl = process.env.APP_URL || "https://af.saop.cc";

  try {
    const videos = await db
      .select({ id: schema.video.id, updatedAt: schema.video.updatedAt })
      .from(schema.video)
      .where(eq(schema.video.status, "PUBLISHED"))
      .orderBy(desc(schema.video.updatedAt))
      .limit(5000);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${videos
  .map(
    (video) => `  <url>
    <loc>${baseUrl}/video/${video.id}</loc>
    <lastmod>${video.updatedAt.toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
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
    console.error("Videos sitemap error:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      {
        headers: { "Content-Type": "application/xml" },
      },
    );
  }
}
