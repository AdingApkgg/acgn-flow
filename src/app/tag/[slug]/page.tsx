import type { RouterClient } from "@orpc/server";
import { HydrationBoundary } from "@tanstack/react-query";
import { type MetaFunction, useLoaderData } from "react-router";
import { CollectionPageJsonLd } from "@/components/seo/json-ld";
import { tagLoader } from "@/routes/data.server";
import { pageMeta, siteName, siteUrl } from "@/routes/metadata";
import type { appRouter } from "@/server/routers/_app";
import { TagPageClient } from "./client";

export const loader = tagLoader;
export type SerializedTag = NonNullable<
  Awaited<ReturnType<RouterClient<typeof appRouter>["tag"]["getBySlug"]>>
>;
export const meta: MetaFunction<typeof loader> = ({ loaderData: data, params }) =>
  data
    ? pageMeta(
        `#${data.tag.name}`,
        `浏览 ${data.tag.name} 标签下的 ${data.tag._count.videos} 个视频`,
        `/tag/${encodeURIComponent(data.tag.slug)}`,
      )
    : pageMeta("标签不存在", "该标签不存在", `/tag/${params.slug}`, { noindex: true });
export default function TagPage() {
  const { tag, dehydratedState } = useLoaderData<typeof loader>();
  return (
    <HydrationBoundary state={dehydratedState}>
      <CollectionPageJsonLd
        name={`#${tag.name} - ${siteName}`}
        description={`浏览 ${tag.name} 标签下的 ${tag._count.videos} 个视频`}
        url={`${siteUrl}/tag/${encodeURIComponent(tag.slug)}`}
        numberOfItems={tag._count.videos}
      />
      <TagPageClient key={tag.id} slug={tag.slug} initialTag={tag} />
    </HydrationBoundary>
  );
}
