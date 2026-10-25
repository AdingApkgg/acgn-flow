import { and, eq, exists } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export async function GET() {
  const baseUrl = process.env.APP_URL || "https://af.saop.cc";

  try {
    const users = await db
      .select({ id: schema.user.id, updatedAt: schema.user.updatedAt })
      .from(schema.user)
      .where(
        exists(
          db
            .select({ id: schema.video.id })
            .from(schema.video)
            .where(
              and(
                eq(schema.video.uploaderId, schema.user.id),
                eq(schema.video.status, "PUBLISHED"),
              ),
            ),
        ),
      )
      .limit(1000);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${users
  .map(
    (user) => `  <url>
    <loc>${baseUrl}/user/${user.id}</loc>
    <lastmod>${user.updatedAt.toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
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
    console.error("Users sitemap error:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
      {
        headers: { "Content-Type": "application/xml" },
      },
    );
  }
}
