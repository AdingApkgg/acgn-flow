"use client";

import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";
import { Search } from "lucide-react";

interface SearchContentProps {
  query: string;
}

export function SearchContent({ query }: SearchContentProps) {
  const { ref, inView } = useInView();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.video.list.useInfiniteQuery(
    { limit: 20, search: query },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: !!query,
    }
  );

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const videos = data?.pages.flatMap((page) => page.videos) ?? [];

  if (!query) {
    return (
      <div className="container py-12 text-center">
        <Search className="h-12 w-12 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold mt-4">搜索视频</h1>
        <p className="text-muted-foreground mt-2">在搜索框中输入关键词开始搜索</p>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">搜索结果</h1>
        <p className="text-muted-foreground">
          关键词: &quot;{query}&quot; - 找到 {videos.length} 个结果
        </p>
      </div>

      <VideoGrid videos={videos} isLoading={isLoading} />

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

      {!isLoading && videos.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">没有找到相关视频</p>
        </div>
      )}
    </div>
  );
}
