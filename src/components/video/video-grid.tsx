"use client";

import { VideoCard } from "./video-card";
import { Skeleton } from "@/components/ui/skeleton";

interface Video {
  id: string;
  title: string;
  coverUrl: string;
  duration?: number | null;
  views: number;
  createdAt: Date;
  uploader: {
    id: string;
    username: string;
    nickname?: string | null;
    avatar?: string | null;
  };
  category?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  _count: {
    likes: number;
    favorites: number;
  };
}

interface VideoGridProps {
  videos: Video[];
  isLoading?: boolean;
}

export function VideoGrid({ videos, isLoading }: VideoGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}

function VideoCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-video rounded-lg" />
      <div className="flex gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}
