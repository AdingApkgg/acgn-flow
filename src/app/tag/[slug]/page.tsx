"use client";

import { use, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import Link from "next/link";
import { Tag } from "lucide-react";
import { motion } from "framer-motion";
import { PageWrapper } from "@/components/motion";

interface TagPageProps {
  params: Promise<{ slug: string }>;
}

export default function TagPage({ params }: TagPageProps) {
  const { slug } = use(params);
  const { ref, inView } = useInView();

  const { data: tag, isLoading: tagLoading } = trpc.tag.getBySlug.useQuery({ slug });

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.video.list.useInfiniteQuery(
    { limit: 20, tagId: tag?.id },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: !!tag?.id,
    }
  );

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const videos = data?.pages.flatMap((page) => page.videos) ?? [];

  if (!tag && !tagLoading) {
    return (
      <PageWrapper>
        <div className="container py-12 text-center">
          <h1 className="text-2xl font-bold">标签不存在</h1>
          <p className="text-muted-foreground mt-2">找不到标签 &ldquo;{slug}&rdquo;</p>
          <Button asChild className="mt-4">
            <Link href="/tags">查看所有标签</Link>
          </Button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="container py-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Tag className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">#{tag?.name}</h1>
              <p className="text-sm text-muted-foreground">
                共 {tag?._count?.videos ?? 0} 个视频
              </p>
            </div>
          </div>
        </motion.div>

        <VideoGrid videos={videos} isLoading={isLoading || tagLoading} />

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

        {!isLoading && videos.length === 0 && tag && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <p className="text-muted-foreground">该标签下暂无视频</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/">浏览全部视频</Link>
            </Button>
          </motion.div>
        )}
      </div>
    </PageWrapper>
  );
}
