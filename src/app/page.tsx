"use client";

import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { AlertTriangle, X, ChevronLeft, ChevronRight } from "lucide-react";
import { WebsiteJsonLd, OrganizationJsonLd } from "@/components/seo/json-ld";
import { SiteStats } from "@/components/stats/site-stats";
import { PageWrapper, FadeIn } from "@/components/motion";
import { cn } from "@/lib/utils";

type SortBy = "recommend" | "latest" | "views" | "likes";

export default function HomePage() {
  const [sortBy, setSortBy] = useState<SortBy>("recommend");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { ref, inView } = useInView();

  // 获取热门标签
  const { data: tagsData } = trpc.tag.list.useQuery({ limit: 30 });

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

  // 检查滚动箭头显示状态
  const checkScrollArrows = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    setShowLeftArrow(container.scrollLeft > 0);
    setShowRightArrow(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 10
    );
  };

  useEffect(() => {
    checkScrollArrows();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScrollArrows);
      window.addEventListener("resize", checkScrollArrows);
      return () => {
        container.removeEventListener("scroll", checkScrollArrows);
        window.removeEventListener("resize", checkScrollArrows);
      };
    }
  }, [tagsData]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollAmount = 200;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const videos = data?.pages.flatMap((page) => page.videos) ?? [];

  // 排序选项
  const sortOptions: { id: SortBy; label: string }[] = [
    { id: "recommend", label: "推荐" },
    { id: "latest", label: "最新" },
    { id: "views", label: "热门" },
    { id: "likes", label: "高赞" },
  ];

  const handleSortClick = (id: SortBy) => {
    setSortBy(id);
    // 不清除标签选择，排序和标签是独立的筛选条件
  };

  const handleTagClick = (tagId: string) => {
    if (selectedTag === tagId) {
      setSelectedTag(null);
    } else {
      setSelectedTag(tagId);
    }
  };

  return (
    <PageWrapper>
      {/* SEO 结构化数据 */}
      <WebsiteJsonLd />
      <OrganizationJsonLd />

      <div className="px-4 md:px-6 py-4 overflow-x-hidden">
        {/* 公告横幅 */}
        <div 
          className={`mb-4 relative overflow-hidden transition-all duration-300 ${
            showAnnouncement ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
            <p className="text-sm text-yellow-600 dark:text-yellow-400 flex-1">
              本站目前处于开发阶段，对你的数据无 SLA 保证！
            </p>
            <button
              onClick={() => setShowAnnouncement(false)}
              className="text-yellow-500 hover:text-yellow-600 dark:hover:text-yellow-300 transition-all hover:scale-110 active:scale-90"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 网站统计 */}
        <FadeIn delay={0.1}>
          <section className="mb-4">
            <SiteStats />
          </section>
        </FadeIn>

        {/* YouTube 风格的标签栏 */}
        <FadeIn delay={0.15}>
          <div className="relative mb-6 overflow-hidden">
            {/* 左侧渐变和箭头 */}
            {showLeftArrow && (
              <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center">
                <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent pointer-events-none" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-background shadow-md hover:bg-accent relative z-10"
                  onClick={() => scroll("left")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* 标签滚动容器 */}
            <div
              ref={scrollContainerRef}
              className="flex gap-2 overflow-x-auto scrollbar-none scroll-smooth px-1 py-1"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {/* 排序按钮 */}
              {sortOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleSortClick(option.id)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                    sortBy === option.id
                      ? "bg-foreground text-background"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}

              {/* 分隔线 */}
              <div className="shrink-0 w-px bg-border my-1" />

              {/* 标签按钮 */}
              {tagsData?.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleTagClick(tag.id)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                    selectedTag === tag.id
                      ? "bg-foreground text-background"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  )}
                >
                  {tag.name}
                </button>
              ))}
            </div>

            {/* 右侧渐变和箭头 */}
            {showRightArrow && (
              <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center">
                <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent pointer-events-none" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full bg-background shadow-md hover:bg-accent relative z-10"
                  onClick={() => scroll("right")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </FadeIn>

        {/* 视频网格 */}
        <section>
          <div key={`${sortBy}-${selectedTag}`}>
            <VideoGrid videos={videos} isLoading={isLoading} />
            
            {/* 无结果提示 */}
            {!isLoading && videos.length === 0 && (
              <div className="text-center py-16">
                <div className="text-muted-foreground mb-4">
                  <p className="text-lg font-medium">没有找到视频</p>
                  <p className="text-sm mt-1">
                    {selectedTag ? "尝试选择其他标签" : "暂无视频内容"}
                  </p>
                </div>
                {selectedTag && (
                  <Button variant="outline" onClick={() => setSelectedTag(null)} className="mt-4">
                    清除筛选
                  </Button>
                )}
              </div>
            )}
          </div>

          {hasNextPage && (
            <div ref={ref} className="flex justify-center py-8">
              {isFetchingNextPage ? (
                <div className="rounded-full h-8 w-8 border-b-2 border-primary animate-spin" />
              ) : (
                <Button variant="outline" onClick={() => fetchNextPage()}>
                  加载更多
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </PageWrapper>
  );
}
