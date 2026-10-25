import { useLoaderData } from "react-router";
import { CollectionPageJsonLd } from "@/components/seo/json-ld";
import { tagsLoader } from "@/routes/data.server";
import { pageMeta, siteName, siteUrl } from "@/routes/metadata";
import { TagsPageClient } from "./client";

export const loader = tagsLoader;
export const meta = () =>
  pageMeta("标签", `浏览 ${siteName} 的所有视频标签，按分类查找 ACGN 相关视频内容`, "/tags", {
    keywords: ["标签", "分类", "ACGN", "动漫", "视频"],
  });
export default function TagsPage() {
  const { popularTags, allTags } = useLoaderData<typeof loader>();
  return (
    <>
      <CollectionPageJsonLd
        name={`标签 - ${siteName}`}
        description={`浏览 ${siteName} 的 ${allTags.length} 个视频标签`}
        url={`${siteUrl}/tags`}
        numberOfItems={allTags.length}
      />
      <TagsPageClient initialPopularTags={popularTags} initialAllTags={allTags} />
    </>
  );
}
