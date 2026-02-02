import type { MetadataRoute } from "next";

// Sitemap Index - 索引多个子 sitemap
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";

  // 返回 sitemap index 格式
  return [
    {
      url: `${baseUrl}/sitemap/static.xml`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/sitemap/videos.xml`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/sitemap/tags.xml`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/sitemap/users.xml`,
      lastModified: new Date(),
    },
  ];
}
