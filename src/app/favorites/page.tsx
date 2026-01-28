"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { VideoCard } from "@/components/video/video-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Loader2 } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { EmptyState } from "@/components/ui/empty-state";

export default function FavoritesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { ref, inView } = useInView();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.video.getFavorites.useInfiniteQuery(
    { limit: 20 },
    {
      enabled: !!session,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/favorites");
    }
  }, [status, router]);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (status === "loading" || isLoading) {
    return (
      <div className="container py-6">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const favorites = data?.pages.flatMap((page) => page.favorites) ?? [];

  return (
    <div className="container py-6">
      <div className="flex items-center gap-3 mb-6">
        <Star className="h-8 w-8 text-yellow-500" />
        <h1 className="text-2xl font-bold">我的收藏</h1>
      </div>

      {favorites.length === 0 ? (
        <EmptyState
          icon={Star}
          title="还没有收藏任何视频"
          description="发现喜欢的视频后，点击收藏按钮即可添加到这里"
          action={{
            label: "去发现视频",
            onClick: () => router.push("/"),
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {favorites.map((video) => (
              <div key={video.id}>
                <VideoCard video={video} />
              </div>
            ))}
          </div>

          <div ref={ref} className="flex justify-center py-8">
            {isFetchingNextPage && (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>
        </>
      )}
    </div>
  );
}
