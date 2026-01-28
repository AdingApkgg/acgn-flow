"use client";

import { VideoCard } from "./video-card";
import { Skeleton } from "@/components/ui/skeleton";

interface Video {
  id: string;
  title: string;
  coverUrl?: string | null;
  duration?: number | null;
  views: number;
  createdAt: Date;
  uploader: {
    id: string;
    username: string;
    nickname?: string | null;
    avatar?: string | null;
  };
  _count: {
    likes: number;
    favorites: number;
  };
}

interface VideoGridProps {
  videos: Video[];
  isLoading?: boolean;
  columns?: 3 | 4 | 5;
}

const gridColumns = {
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  5: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
};

export function VideoGrid({ videos, isLoading, columns = 4 }: VideoGridProps) {
  if (isLoading) {
    return (
      <div className={`grid ${gridColumns[columns]} gap-3 sm:gap-4 lg:gap-5`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">暂无视频</p>
      </div>
    );
  }

  return (
    <div className={`grid ${gridColumns[columns]} gap-3 sm:gap-4 lg:gap-5`}>
      {videos.map((video, index) => (
        <VideoCard key={video.id} video={video} index={index} />
      ))}
    </div>
  );
}

function VideoCardSkeleton() {
  return (
    <div className="space-y-3">
      {/* 封面骨架 */}
      <div className="relative aspect-video rounded-xl overflow-hidden">
        <Skeleton className="absolute inset-0" />
        {/* 模拟时长标签 */}
        <div className="absolute bottom-2.5 right-2.5">
          <Skeleton className="h-5 w-12 rounded-md" />
        </div>
        {/* 模拟统计标签 */}
        <div className="absolute bottom-2.5 left-2.5 flex gap-2">
          <Skeleton className="h-5 w-14 rounded" />
          <Skeleton className="h-5 w-10 rounded" />
        </div>
      </div>
      {/* 信息骨架 */}
      <div className="flex gap-2 sm:gap-3 px-0.5">
        <Skeleton className="h-8 w-8 sm:h-9 sm:w-9 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}
