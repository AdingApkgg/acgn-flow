"use client";

import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { motion, AnimatePresence } from "framer-motion";
import { PageWrapper, FadeIn } from "@/components/motion";

type SortBy = "latest" | "views" | "likes";

export default function HomePage() {
  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const { ref, inView } = useInView();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.video.list.useInfiniteQuery(
    { limit: 20, sortBy },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const videos = data?.pages.flatMap((page) => page.videos) ?? [];

  return (
    <PageWrapper>
      <div className="container py-6">
        <section className="mb-8">
          <FadeIn className="flex items-center justify-between mb-6">
            <motion.h1 
              className="text-2xl font-bold"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
            >
              发现视频
            </motion.h1>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <Tabs
                value={sortBy}
                onValueChange={(v) => setSortBy(v as SortBy)}
              >
                <TabsList>
                  <TabsTrigger value="latest">最新</TabsTrigger>
                  <TabsTrigger value="views">热门</TabsTrigger>
                  <TabsTrigger value="likes">最多点赞</TabsTrigger>
                </TabsList>
              </Tabs>
            </motion.div>
          </FadeIn>

          <AnimatePresence mode="wait">
            <motion.div
              key={sortBy}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <VideoGrid videos={videos} isLoading={isLoading} />
            </motion.div>
          </AnimatePresence>

          {hasNextPage && (
            <motion.div 
              ref={ref} 
              className="flex justify-center py-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {isFetchingNextPage ? (
                <motion.div 
                  className="rounded-full h-8 w-8 border-b-2 border-primary"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              ) : (
                <Button variant="outline" onClick={() => fetchNextPage()}>
                  加载更多
                </Button>
              )}
            </motion.div>
          )}
        </section>
      </div>
    </PageWrapper>
  );
}
