import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { TagPageClient } from "./client";
import { cache } from "react";
import { CollectionPageJsonLd } from "@/components/seo/json-ld";

interface TagPageProps {
  params: Promise<{ slug: string }>;
}

// 使用 React cache 避免重复查询
const getTag = cache(async (slug: string) => {
  return prisma.tag.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: {
        select: { videos: true },
      },
    },
  });
});

// 预生成热门标签页面
export async function generateStaticParams() {
  const popularTags = await prisma.tag.findMany({
    take: 50, // 预生成前 50 个热门标签
    orderBy: { videos: { _count: "desc" } },
    select: { slug: true },
  });

  return popularTags.map((tag) => ({
    slug: tag.slug,
  }));
}

// 动态生成 metadata
export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const tag = await getTag(slug);

  if (!tag) {
    return {
      title: "标签不存在",
      description: "该标签可能已被删除或不存在",
    };
  }

  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";
  const description = `浏览 ${tag.name} 标签下的 ${tag._count.videos} 个视频`;

  return {
    title: `#${tag.name}`,
    description,
    keywords: [tag.name, "ACGN", "视频", "标签"],
    openGraph: {
      type: "website",
      title: `#${tag.name} - ${siteName}`,
      description,
    },
    twitter: {
      card: "summary",
      title: `#${tag.name} - ${siteName}`,
      description,
    },
  };
}

// 序列化标签数据
function serializeTag(tag: NonNullable<Awaited<ReturnType<typeof getTag>>>) {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    _count: tag._count,
  };
}

export type SerializedTag = ReturnType<typeof serializeTag>;

export default async function TagPage({ params }: TagPageProps) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const tag = await getTag(slug);

  // 服务端预取标签数据
  const initialTag = tag ? serializeTag(tag) : null;
  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://acgn.app";

  return (
    <>
      {tag && (
        <CollectionPageJsonLd
          name={`#${tag.name} - ${siteName}`}
          description={`浏览 ${tag.name} 标签下的 ${tag._count.videos} 个视频`}
          url={`${siteUrl}/tag/${tag.slug}`}
          numberOfItems={tag._count.videos}
        />
      )}
      <TagPageClient slug={slug} initialTag={initialTag} />
    </>
  );
}
