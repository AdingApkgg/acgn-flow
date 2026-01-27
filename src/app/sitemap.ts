import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

// 强制动态渲染，避免构建时预渲染（此时数据库不可用）
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";

  // 静态页面
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/tags`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/comments`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.5,
    },
  ];

  // 在构建时数据库可能不可用，使用 try-catch 优雅降级
  try {
    // 获取所有已发布的视频
    const videos = await prisma.video.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    });

    const videoPages: MetadataRoute.Sitemap = videos.map((video) => ({
      url: `${baseUrl}/video/${video.id}`,
      lastModified: video.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    }));

    // 获取所有标签
    const tags = await prisma.tag.findMany({
      select: { slug: true },
      take: 500,
    });

    const tagPages: MetadataRoute.Sitemap = tags.map((tag) => ({
      url: `${baseUrl}/tag/${tag.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    // 获取用户主页（只包含有视频的用户）
    const users = await prisma.user.findMany({
      where: {
        videos: {
          some: { status: "PUBLISHED" },
        },
      },
      select: { id: true, updatedAt: true },
      take: 500,
    });

    const userPages: MetadataRoute.Sitemap = users.map((user) => ({
      url: `${baseUrl}/user/${user.id}`,
      lastModified: user.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));

    return [...staticPages, ...videoPages, ...tagPages, ...userPages];
  } catch {
    // 数据库不可用时只返回静态页面
    console.warn("Sitemap: Database unavailable, returning static pages only");
    return staticPages;
  }
}
