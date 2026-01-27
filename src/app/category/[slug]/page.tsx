"use client";

import { use, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import Link from "next/link";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export default function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = use(params);
  const { ref, inView } = useInView();

  const { data: category } = trpc.category.getBySlug.useQuery({ slug });

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.video.list.useInfiniteQuery(
    { limit: 20, categoryId: category?.id },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: !!category?.id,
    }
  );

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const videos = data?.pages.flatMap((page) => page.videos) ?? [];

  if (!category && !isLoading) {
    return (
      <div className="container py-12 text-center">
        <h1 className="text-2xl font-bold">分类不存在</h1>
        <Button asChild className="mt-4">
          <Link href="/categories">查看所有分类</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{category?.name}</h1>
        {category?.description && (
          <p className="text-muted-foreground mt-1">{category.description}</p>
        )}
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
    </div>
  );
}
