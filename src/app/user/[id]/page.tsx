import type { RouterClient } from "@orpc/server";
import { HydrationBoundary } from "@tanstack/react-query";
import { type MetaFunction, useLoaderData } from "react-router";
import { userLoader } from "@/routes/data.server";
import { pageMeta } from "@/routes/metadata";
import type { appRouter } from "@/server/routers/_app";
import { UserPageClient } from "./client";

export const loader = userLoader;
export type SerializedUser = NonNullable<
  Awaited<ReturnType<RouterClient<typeof appRouter>["user"]["getProfile"]>>
>;
export const meta: MetaFunction<typeof loader> = ({ loaderData: data, params }) =>
  data
    ? pageMeta(
        data.user.nickname || data.user.username,
        data.user.bio?.slice(0, 160) ||
          `${data.user.nickname || data.user.username} 的个人主页，已发布 ${data.user._count.videos} 个视频`,
        `/user/${params.id}`,
        { image: data.user.avatar, type: "profile" },
      )
    : pageMeta("用户不存在", "该用户不存在", `/user/${params.id}`, { noindex: true });
export default function UserPage() {
  const { user, dehydratedState } = useLoaderData<typeof loader>();
  return (
    <HydrationBoundary state={dehydratedState}>
      <UserPageClient key={user.id} id={user.id} initialUser={user} />
    </HydrationBoundary>
  );
}
