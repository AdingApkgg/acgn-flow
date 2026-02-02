"use client";

import { trpc } from "@/lib/trpc";
import { VideoGrid } from "@/components/video/video-grid";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import { useEffect, useState } from "react";
import { Search, ArrowUpDown, Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface SearchContentProps {
  query: string;
}

type SortBy = "latest" | "views" | "likes" | "recommend";
type TimeRange = "all" | "today" | "week" | "month";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "latest", label: "最新发布" },
  { value: "views", label: "播放量" },
  { value: "likes", label: "点赞数" },
  { value: "recommend", label: "推荐" },
];

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "all", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
];

export function SearchContent({ query }: SearchContentProps) {
  const { ref, inView } = useInView();
  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.video.list.useInfiniteQuery(
    { limit: 20, search: query, sortBy, timeRange },
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
  const totalCount = data?.pages[0]?.totalCount ?? 0;
  const hasFilters = sortBy !== "latest" || timeRange !== "all";

  const resetFilters = () => {
    setSortBy("latest");
    setTimeRange("all");
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">搜索结果</h1>
            <p className="text-muted-foreground">
              关键词: &quot;{query}&quot;
              {!isLoading && (
                <span> - 找到 {totalCount} 个结果</span>
              )}
            </p>
          </div>

          {/* 筛选选项 */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 排序 */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="w-[130px] h-9">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 时间范围 */}
            <Select
              value={timeRange}
              onValueChange={(v) => setTimeRange(v as TimeRange)}
            >
              <SelectTrigger className="w-[120px] h-9">
                <Clock className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 重置筛选 */}
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-9"
              >
                重置
              </Button>
            )}
          </div>
        </div>

        {/* 活动筛选标签 */}
        {hasFilters && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-sm text-muted-foreground">筛选条件:</span>
            {sortBy !== "latest" && (
              <Badge variant="secondary" className="text-xs">
                {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
              </Badge>
            )}
            {timeRange !== "all" && (
              <Badge variant="secondary" className="text-xs">
                {TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label}
              </Badge>
            )}
          </div>
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

      {!isLoading && videos.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">没有找到相关视频</p>
          {hasFilters && (
            <Button variant="link" onClick={resetFilters} className="mt-2">
              尝试清除筛选条件
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
