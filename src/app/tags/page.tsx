"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// Note: metadata is exported from a separate file to allow client component
// See: https://nextjs.org/docs/app/building-your-application/optimizing/metadata

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
    <div className="container py-6 animate-in fade-in duration-300">
      <h1 className="text-2xl font-bold mb-6">标签</h1>

      {popularTags && popularTags.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">热门标签</h2>
          <div className="flex flex-wrap gap-2">
            {popularTags.map((tag) => (
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

      <section>
        <h2 className="text-xl font-bold mb-4">所有标签</h2>
        {allTags && allTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => (
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
          <p className="text-muted-foreground">暂无标签</p>
        )}
      </section>
    </div>
  );
}
