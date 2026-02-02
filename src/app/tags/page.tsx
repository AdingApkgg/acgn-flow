import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { TagsPageClient } from "./client";
import { CollectionPageJsonLd } from "@/components/seo/json-ld";

const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://acgn.app";

export const metadata: Metadata = {
  title: "标签",
  description: `浏览 ${siteName} 的所有视频标签，按分类查找 ACGN 相关视频内容`,
  keywords: ["标签", "分类", "ACGN", "动漫", "视频"],
};

// 获取服务端数据
async function getTagsData() {
  const [popularTags, allTags] = await Promise.all([
    prisma.tag.findMany({
      take: 20,
      include: {
        _count: { select: { videos: true } },
      },
      orderBy: {
        videos: { _count: "desc" },
      },
    }),
    prisma.tag.findMany({
      take: 100,
      include: {
        _count: { select: { videos: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return { popularTags, allTags };
}

export default async function TagsPage() {
  const { popularTags, allTags } = await getTagsData();
  const totalTags = allTags.length;

  return (
    <>
      <CollectionPageJsonLd
        name={`标签 - ${siteName}`}
        description={`浏览 ${siteName} 的 ${totalTags} 个视频标签`}
        url={`${siteUrl}/tags`}
        numberOfItems={totalTags}
      />
      <TagsPageClient
        initialPopularTags={popularTags}
        initialAllTags={allTags}
      />
    </>
  );
}
