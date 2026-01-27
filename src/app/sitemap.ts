import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

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
      url: `${baseUrl}/categories`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
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

  // 获取所有分类
  const categories = await prisma.category.findMany({
    select: { slug: true, createdAt: true },
  });

  const categoryPages: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${baseUrl}/category/${category.slug}`,
    lastModified: category.createdAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
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

  return [...staticPages, ...videoPages, ...categoryPages, ...tagPages, ...userPages];
}
