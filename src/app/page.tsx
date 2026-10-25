import { HydrationBoundary, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { useLoaderData, useSearchParams } from "react-router";
import { FadeIn, PageWrapper } from "@/components/motion";
import { OrganizationJsonLd, WebsiteJsonLd } from "@/components/seo/json-ld";
import { SiteStats } from "@/components/stats/site-stats";
import { Button } from "@/components/ui/button";
import { VideoGrid } from "@/components/video/video-grid";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { homeLoader } from "@/routes/data.server";
import { pageMeta, siteName } from "@/routes/metadata";

type SortBy = "recommend" | "latest" | "views" | "likes";

function HomeContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSort = searchParams.get("sort");
  const sortBy: SortBy =
    requestedSort && ["recommend", "latest", "views", "likes"].includes(requestedSort)
      ? (requestedSort as SortBy)
      : "recommend";
  const selectedTag = searchParams.get("tag");
  const setSortBy = (sort: SortBy) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("sort", sort);
      return next;
    });
  const setSelectedTag = (tag: string | null) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tag) next.set("tag", tag);
      else next.delete("tag");
      return next;
    });
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { ref, inView } = useInView();

  // 获取热门标签
  const { data: tagsData } = useQuery(orpc.tag.list.queryOptions({ input: { limit: 30 }, ...{} }));

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(
    orpc.video.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        ...{
          limit: 20,
          sortBy,
          tagId: selectedTag || undefined,
        },
        cursor,
      }),
      initialPageParam: undefined as string | undefined,
      ...{
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    }),
  );

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 检查滚动箭头显示状态
  const checkScrollArrows = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setShowLeftArrow(container.scrollLeft > 0);
    setShowRightArrow(container.scrollLeft < container.scrollWidth - container.clientWidth - 10);
  }, []);

  useEffect(() => {
    if (!tagsData) return;
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
  }, [tagsData, checkScrollArrows]);

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
              type="button"
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
                  type="button"
                  key={option.id}
                  onClick={() => handleSortClick(option.id)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                    sortBy === option.id
                      ? "bg-foreground text-background"
                      : "bg-muted hover:bg-muted/80 text-foreground",
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
                  type="button"
                  key={tag.id}
                  onClick={() => handleTagClick(tag.id)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
                    selectedTag === tag.id
                      ? "bg-foreground text-background"
                      : "bg-muted hover:bg-muted/80 text-foreground",
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

export const loader = homeLoader;
export const meta = () =>
  pageMeta(
    "ACGN Fans 流式媒体内容分享平台",
    `${siteName} 提供丰富的动画、漫画、游戏、轻小说相关内容。`,
    "/",
  );
export default function HomePage() {
  const { dehydratedState } = useLoaderData<typeof loader>();
  return (
    <HydrationBoundary state={dehydratedState}>
      <HomeContent />
    </HydrationBoundary>
  );
}
