import { HydrationBoundary } from "@tanstack/react-query";
import { type MetaFunction, useLoaderData } from "react-router";
import { searchLoader } from "@/routes/data.server";
import { pageMeta, siteName } from "@/routes/metadata";
import { SearchContent } from "./client";

export const loader = searchLoader;
export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) =>
  pageMeta(
    data?.query ? `"${data.query}" 的搜索结果` : "搜索视频",
    data?.query
      ? `在 ${siteName} 搜索 "${data.query}" 的相关视频`
      : `在 ${siteName} 搜索 ACGN 相关视频内容`,
    "/search",
    { noindex: !!data?.query },
  );
export default function SearchPage() {
  const { query, dehydratedState } = useLoaderData<typeof loader>();
  return (
    <HydrationBoundary state={dehydratedState}>
      <SearchContent key={query} query={query} />
    </HydrationBoundary>
  );
}
