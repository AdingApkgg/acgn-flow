"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, X, Tags, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/lib/hooks";

interface TagData {
  id: string;
  name: string;
  slug: string;
  _count: { videos: number };
}

interface TagsPageClientProps {
  initialPopularTags: TagData[];
  initialAllTags: TagData[];
}

export function TagsPageClient({
  initialPopularTags,
  initialAllTags,
}: TagsPageClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  // 只在搜索时请求 API
  const { data: searchResults, isLoading: searchLoading } =
    trpc.tag.list.useQuery(
      { search: debouncedSearch, limit: 100 },
      {
        enabled: debouncedSearch.length > 0,
      }
    );

  // 计算显示的标签
  const displayTags = useMemo(() => {
    if (debouncedSearch.length > 0) {
      return searchResults || [];
    }
    return initialAllTags;
  }, [debouncedSearch, searchResults, initialAllTags]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  const isSearching = searchQuery.length > 0;
  const showLoading = isSearching && searchLoading;

  return (
    <div className="container py-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">标签</h1>
        <span className="text-sm text-muted-foreground">
          共 {initialAllTags.length} 个标签
        </span>
      </div>

      {/* 搜索框 */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="搜索标签..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={clearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* 热门标签（仅在未搜索时显示） */}
      {!isSearching && initialPopularTags.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold">热门标签</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {initialPopularTags.map((tag) => (
              <Link
                key={tag.id}
                href={`/tag/${tag.slug}`}
                className="transition-transform duration-200 hover:scale-105 active:scale-95"
              >
                <Badge
                  variant="default"
                  className="text-sm py-1.5 px-3 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  {tag.name}
                  <span className="ml-1 opacity-70">({tag._count.videos})</span>
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 所有标签/搜索结果 */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Tags className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-bold">
            {isSearching
              ? `搜索结果 (${displayTags.length})`
              : "所有标签"}
          </h2>
        </div>

        {showLoading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-full" />
            ))}
          </div>
        ) : displayTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {displayTags.map((tag) => (
              <Link
                key={tag.id}
                href={`/tag/${tag.slug}`}
                className="transition-all duration-200 hover:scale-105 hover:-translate-y-0.5 active:scale-95"
              >
                <Badge
                  variant="outline"
                  className="text-sm py-1.5 px-3 cursor-pointer hover:bg-accent transition-colors"
                >
                  {tag.name}
                  <span className="ml-1 opacity-70">({tag._count.videos})</span>
                </Badge>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              {isSearching
                ? `没有找到包含 "${searchQuery}" 的标签`
                : "暂无标签"}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
