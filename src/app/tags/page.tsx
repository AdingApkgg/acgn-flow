"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function TagsPage() {
  const { data: popularTags, isLoading: loadingPopular } =
    trpc.tag.popular.useQuery({ limit: 20 });
  const { data: allTags, isLoading: loadingAll } =
    trpc.tag.list.useQuery({ limit: 100 });

  const isLoading = loadingPopular || loadingAll;

  if (isLoading) {
    return (
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">标签</h1>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 20 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <h1 className="text-2xl font-bold mb-6">标签</h1>

      {popularTags && popularTags.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">热门标签</h2>
          <div className="flex flex-wrap gap-2">
            {popularTags.map((tag) => (
              <div
                key={tag.id}
                className="transition-transform hover:scale-105 active:scale-95"
              >
                <Link href={`/tag/${tag.slug}`}>
                  <Badge
                    variant="default"
                    className="text-sm py-1.5 px-3 cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    {tag.name}
                    <span className="ml-1 opacity-70">({tag._count.videos})</span>
                  </Badge>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-bold mb-4">所有标签</h2>
        {allTags && allTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => (
              <div
                key={tag.id}
                className="transition-transform hover:scale-105 active:scale-95"
              >
                <Link href={`/tag/${tag.slug}`}>
                  <Badge
                    variant="outline"
                    className="text-sm py-1.5 px-3 cursor-pointer hover:bg-accent transition-colors"
                  >
                    {tag.name}
                    <span className="ml-1 opacity-70">({tag._count.videos})</span>
                  </Badge>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">暂无标签</p>
        )}
      </section>
    </div>
  );
}
