"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageWrapper, FadeIn, motion } from "@/components/motion";

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
    <PageWrapper className="container py-6">
      <FadeIn>
        <motion.h1 
          className="text-2xl font-bold mb-6"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          标签
        </motion.h1>
      </FadeIn>

      {popularTags && popularTags.length > 0 && (
        <FadeIn delay={0.1}>
          <section className="mb-8">
            <h2 className="text-xl font-bold mb-4">热门标签</h2>
            <div className="flex flex-wrap gap-2">
              {popularTags.map((tag, index) => (
                <motion.div
                  key={tag.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.03 }}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
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
                </motion.div>
              ))}
            </div>
          </section>
        </FadeIn>
      )}

      <FadeIn delay={0.2}>
        <section>
          <h2 className="text-xl font-bold mb-4">所有标签</h2>
          {allTags && allTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag, index) => (
                <motion.div
                  key={tag.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.02, 0.5) }}
                  whileHover={{ scale: 1.08, y: -2 }}
                  whileTap={{ scale: 0.95 }}
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
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">暂无标签</p>
          )}
        </section>
      </FadeIn>
    </PageWrapper>
  );
}
