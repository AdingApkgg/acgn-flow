"use client";

import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { motion, AnimatePresence } from "framer-motion";
import { PageWrapper, FadeIn } from "@/components/motion";
import { AlertTriangle, X, Clock, TrendingUp, Heart, Sparkles, Calendar, Filter, RotateCcw } from "lucide-react";
import { WebsiteJsonLd, OrganizationJsonLd } from "@/components/seo/json-ld";
import { SiteStats } from "@/components/stats/site-stats";
import Link from "next/link";

type SortBy = "latest" | "views" | "likes";
type TimeRange = "all" | "today" | "week" | "month";

const sortOptions = [
  { value: "latest", label: "最新", icon: Clock },
  { value: "views", label: "热门", icon: TrendingUp },
  { value: "likes", label: "点赞", icon: Heart },
] as const;

const timeOptions = [
  { value: "all", label: "全部" },
  { value: "today", label: "今天" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
] as const;

export default function HomePage() {
  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const { ref, inView } = useInView();

  // 获取热门标签
  const { data: tagsData } = trpc.tag.list.useQuery({ limit: 10 });

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.video.list.useInfiniteQuery(
    { 
      limit: 20, 
      sortBy, 
      timeRange,
      tagId: selectedTag || undefined,
    },
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
  const hasFilters = sortBy !== "latest" || timeRange !== "all" || selectedTag !== null;

  const resetFilters = () => {
    setSortBy("latest");
    setTimeRange("all");
    setSelectedTag(null);
  };

  return (
    <PageWrapper>
      {/* SEO 结构化数据 */}
      <WebsiteJsonLd />
      <OrganizationJsonLd />

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

        {/* 网站统计 */}
        <section className="mb-8">
          <SiteStats />
        </section>

        <section className="mb-8">
          {/* 标题和筛选区域 */}
          <FadeIn className="space-y-4 mb-6">
            {/* 第一行：标题和排序 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <motion.h1 
                className="text-xl sm:text-2xl font-bold flex items-center gap-2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
              >
                <Sparkles className="h-6 w-6 text-primary" />
                发现视频
              </motion.h1>
              
              {/* 排序按钮组 */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex items-center gap-2"
              >
                <div className="flex bg-muted rounded-lg p-1 gap-0.5 sm:gap-0">
                  {sortOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = sortBy === option.value;
                    return (
                      <motion.button
                        key={option.value}
                        onClick={() => setSortBy(option.value)}
                        className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                          isActive 
                            ? "bg-background text-foreground shadow-sm" 
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{option.label}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            </div>

            {/* 第二行：时间范围和标签筛选 */}
            <motion.div 
              className="flex flex-wrap items-center gap-2 sm:gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
            >
              {/* 时间范围 */}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div className="flex gap-1">
                  {timeOptions.map((option) => (
                    <motion.button
                      key={option.value}
                      onClick={() => setTimeRange(option.value)}
                      className={`px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all ${
                        timeRange === option.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {option.label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* 分隔线 */}
              <div className="h-5 w-px bg-border hidden sm:block" />

              {/* 热门标签 */}
              {tagsData && tagsData.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <div className="flex gap-1.5 flex-wrap">
                    {tagsData.slice(0, 6).map((tag, index) => (
                      <motion.div
                        key={tag.id}
                        className={index >= 4 ? "hidden sm:inline-flex" : undefined}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Badge
                          variant={selectedTag === tag.id ? "default" : "outline"}
                          className="cursor-pointer text-xs"
                          onClick={() => setSelectedTag(selectedTag === tag.id ? null : tag.id)}
                        >
                          {tag.name}
                        </Badge>
                      </motion.div>
                    ))}
                    <Link href="/tags">
                      <Badge variant="ghost" className="cursor-pointer text-xs hover:bg-muted">
                        更多...
                      </Badge>
                    </Link>
                  </div>
                </div>
              )}

              {/* 重置筛选 */}
              <AnimatePresence>
                {hasFilters && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={resetFilters}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    重置
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>

            {/* 当前筛选状态 */}
            <AnimatePresence>
              {selectedTag && tagsData && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <span>正在筛选：</span>
                  <Badge variant="secondary" className="gap-1">
                    {tagsData.find(t => t.id === selectedTag)?.name}
                    <button onClick={() => setSelectedTag(null)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                </motion.div>
              )}
            </AnimatePresence>
          </FadeIn>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${sortBy}-${timeRange}-${selectedTag}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <VideoGrid videos={videos} isLoading={isLoading} />
              
              {/* 无结果提示 */}
              {!isLoading && videos.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-16"
                >
                  <div className="text-muted-foreground mb-4">
                    <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">没有找到符合条件的视频</p>
                    <p className="text-sm mt-1">尝试调整筛选条件</p>
                  </div>
                  {hasFilters && (
                    <Button variant="outline" onClick={resetFilters} className="mt-4">
                      <RotateCcw className="h-4 w-4 mr-2" />
                      重置筛选
                    </Button>
                  )}
                </motion.div>
              )}
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
