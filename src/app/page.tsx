"use client";

import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { motion, AnimatePresence } from "framer-motion";
import { PageWrapper, FadeIn } from "@/components/motion";
import { AlertTriangle, X } from "lucide-react";

type SortBy = "latest" | "views" | "likes";

export default function HomePage() {
  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const [showAnnouncement, setShowAnnouncement] = useState(true);
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
        {/* 公告横幅 */}
        <AnimatePresence>
          {showAnnouncement && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="mb-6 relative"
            >
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                <p className="text-sm text-yellow-600 dark:text-yellow-400 flex-1">
                  本站目前处于开发阶段，对你的数据无 SLA 保证！
                </p>
                <button
                  onClick={() => setShowAnnouncement(false)}
                  className="text-yellow-500 hover:text-yellow-600 dark:hover:text-yellow-300 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
