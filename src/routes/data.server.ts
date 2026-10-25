import { createRouterClient, ORPCError } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import { type LoaderFunctionArgs, redirect } from "react-router";
import { getSession } from "@/lib/auth";
import { createContext } from "@/server/orpc";
import { appRouter } from "@/server/routers/_app";

export function getServerApi(request: Request) {
  const rpc = createRouterClient(appRouter, { context: () => createContext({ req: request }) });
  return { rpc, api: createTanstackQueryUtils(rpc), queryClient: new QueryClient() };
}

export async function requireUser({ request }: LoaderFunctionArgs) {
  const session = await getSession(request.headers);
  if (!session) {
    const url = new URL(request.url);
    throw redirect(`/login?callbackUrl=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return session;
}

export async function requireAdmin(args: LoaderFunctionArgs) {
  const session = await requireUser(args);
  if (session.user.role !== "ADMIN" && session.user.role !== "OWNER")
    throw new Response("禁止访问", { status: 403 });
  return null;
}

export async function homeLoader({ request }: LoaderFunctionArgs) {
  const { api, queryClient } = getServerApi(request);
  const params = new URL(request.url).searchParams;
  const sortBy = ["recommend", "latest", "views", "likes"].includes(params.get("sort") || "")
    ? (params.get("sort") as "recommend" | "latest" | "views" | "likes")
    : "recommend";
  const tagId = params.get("tag") || undefined;
  await Promise.all([
    queryClient.fetchQuery(api.tag.list.queryOptions({ input: { limit: 30 } })),
    queryClient.fetchInfiniteQuery(
      api.video.list.infiniteOptions({
        input: (cursor: string | undefined) => ({ limit: 20, sortBy, tagId, cursor }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor,
      }),
    ),
    queryClient.fetchQuery(api.video.getPublicStats.queryOptions()),
  ]);
  return { dehydratedState: dehydrate(queryClient) };
}

export async function searchLoader({ request }: LoaderFunctionArgs) {
  const { api, queryClient } = getServerApi(request);
  const params = new URL(request.url).searchParams;
  const query = params.get("q") || "";
  const sortBy = ["latest", "views", "likes", "recommend"].includes(params.get("sort") || "")
    ? (params.get("sort") as "latest" | "views" | "likes" | "recommend")
    : "latest";
  const timeRange = ["all", "today", "week", "month"].includes(params.get("time") || "")
    ? (params.get("time") as "all" | "today" | "week" | "month")
    : "all";
  if (query)
    await queryClient.fetchInfiniteQuery(
      api.video.list.infiniteOptions({
        input: (cursor: string | undefined) => ({
          limit: 20,
          search: query,
          sortBy,
          timeRange,
          cursor,
        }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextCursor,
      }),
    );
  return { query, dehydratedState: dehydrate(queryClient) };
}

export async function videoLoader({ request, params }: LoaderFunctionArgs) {
  const { api, queryClient } = getServerApi(request);
  try {
    const video = await queryClient.fetchQuery(
      api.video.getById.queryOptions({ input: { id: params.id || "" } }),
    );
    if (!video) throw new Response("视频不存在", { status: 404 });
    return { video, dehydratedState: dehydrate(queryClient) };
  } catch (error) {
    if (error instanceof ORPCError && ["NOT_FOUND", "FORBIDDEN"].includes(error.code))
      throw new Response("视频不存在", { status: 404 });
    throw error;
  }
}

export async function tagLoader({ request, params }: LoaderFunctionArgs) {
  const { api, queryClient } = getServerApi(request);
  const tag = await queryClient.fetchQuery(
    api.tag.getBySlug.queryOptions({ input: { slug: params.slug || "" } }),
  );
  if (!tag) throw new Response("标签不存在", { status: 404 });
  await queryClient.fetchInfiniteQuery(
    api.video.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ limit: 20, tagId: tag.id, cursor }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return { tag, dehydratedState: dehydrate(queryClient) };
}

export async function userLoader({ request, params }: LoaderFunctionArgs) {
  const { api, queryClient } = getServerApi(request);
  const user = await queryClient
    .fetchQuery(api.user.getProfile.queryOptions({ input: { id: params.id || "" } }))
    .catch((error: unknown) => {
      if (error instanceof ORPCError && error.code === "NOT_FOUND")
        throw new Response("用户不存在", { status: 404 });
      throw error;
    });
  if (!user) throw new Response("用户不存在", { status: 404 });
  await queryClient.fetchInfiniteQuery(
    api.user.getVideos.infiniteOptions({
      input: (cursor: string | undefined) => ({ userId: user.id, limit: 20, cursor }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor,
    }),
  );
  return { user, dehydratedState: dehydrate(queryClient) };
}

export async function tagsLoader({ request }: LoaderFunctionArgs) {
  const { rpc } = getServerApi(request);
  const [popularTags, allTags] = await Promise.all([
    rpc.tag.popular({ limit: 20 }),
    rpc.tag.list({ limit: 100 }),
  ]);
  return { popularTags, allTags };
}
