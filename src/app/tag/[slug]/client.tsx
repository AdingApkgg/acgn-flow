"use client";

import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import Link from "next/link";
import { Tag } from "lucide-react";
import type { SerializedTag } from "./page";

interface TagPageClientProps {
  slug: string;
  initialTag: SerializedTag | null;
}

export function TagPageClient({ slug, initialTag }: TagPageClientProps) {
  const { ref, inView } = useInView();

  // 客户端获取标签数据（如果需要刷新）
  const { data: tag, isLoading: tagLoading } = trpc.tag.getBySlug.useQuery(
    { slug },
    {
      // 如果有初始数据，延迟重新请求
      staleTime: initialTag ? 60000 : 0,
      refetchOnMount: !initialTag,
    }
  );

  // 优先使用服务端数据，然后是客户端数据
  const displayTag = tag || initialTag;

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.video.list.useInfiniteQuery(
    { limit: 20, tagId: displayTag?.id },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: !!displayTag?.id,
    }
  );

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const videos = data?.pages.flatMap((page) => page.videos) ?? [];

  // 标签不存在
  if (!initialTag && !displayTag && !tagLoading) {
    return (
      <div className="container py-12 text-center">
        <h1 className="text-2xl font-bold">标签不存在</h1>
        <p className="text-muted-foreground mt-2">找不到标签 &ldquo;{slug}&rdquo;</p>
        <Button asChild className="mt-4">
          <Link href="/tags">查看所有标签</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Tag className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">#{displayTag?.name || initialTag?.name}</h1>
            <p className="text-sm text-muted-foreground">
              共 {displayTag?._count?.videos ?? initialTag?._count?.videos ?? 0} 个视频
            </p>
          </div>
        </div>
      </div>

      <VideoGrid videos={videos} isLoading={isLoading || (!initialTag && tagLoading)} />

      {hasNextPage && (
        <div ref={ref} className="flex justify-center py-8">
          {isFetchingNextPage ? (
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          ) : (
            <Button variant="outline" onClick={() => fetchNextPage()}>
              加载更多
            </Button>
          )}
        </div>
      )}

      {!isLoading && videos.length === 0 && displayTag && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">该标签下暂无视频</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/">浏览全部视频</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
