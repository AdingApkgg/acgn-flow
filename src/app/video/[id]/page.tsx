import type { RouterClient } from "@orpc/server";
import { HydrationBoundary } from "@tanstack/react-query";
import { type MetaFunction, useLoaderData } from "react-router";
import { videoLoader } from "@/routes/data.server";
import { pageMeta } from "@/routes/metadata";
import type { appRouter } from "@/server/routers/_app";
import { VideoPageClient } from "./client";

export const loader = videoLoader;
export type SerializedVideo = NonNullable<
  Awaited<ReturnType<RouterClient<typeof appRouter>["video"]["getById"]>>
>;
export const meta: MetaFunction<typeof loader> = ({ loaderData: data, params }) =>
  data
    ? pageMeta(
        data.video.title,
        data.video.description?.slice(0, 160) ||
          `由 ${data.video.uploader.nickname || data.video.uploader.username} 上传的视频`,
        `/video/${params.id}`,
        {
          image: data.video.coverUrl,
          type: "video.other",
          keywords: ["ACGN", "视频", ...data.video.tags.map(({ tag }) => tag.name)],
        },
      )
    : pageMeta("视频不存在", "该视频不存在或尚未公开", `/video/${params.id}`, { noindex: true });
export default function VideoPage() {
  const { video, dehydratedState } = useLoaderData<typeof loader>();
  return (
    <HydrationBoundary state={dehydratedState}>
      <VideoPageClient key={video.id} id={video.id} initialVideo={video} />
    </HydrationBoundary>
  );
}
