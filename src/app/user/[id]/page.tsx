"use client";

import { use, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { VideoCard } from "@/components/video/video-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Calendar, Video, Heart, Star, Loader2 } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { PageWrapper, staggerContainer, staggerItem } from "@/components/motion";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/format";
import Link from "next/link";

interface UserPageProps {
  params: Promise<{ id: string }>;
}

export default function UserPage({ params }: UserPageProps) {
  const { id } = use(params);
  const { ref, inView } = useInView();

  const { data: user, isLoading: userLoading } = trpc.user.getProfile.useQuery({ id });

  const {
    data,
    isLoading: videosLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.user.getVideos.useInfiniteQuery(
    { userId: id, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (userLoading) {
    return (
      <div className="container py-6">
        <div className="flex items-start gap-6 mb-8">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-16 w-full max-w-md" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-12 text-center">
        <h1 className="text-2xl font-bold">用户不存在</h1>
        <p className="text-muted-foreground mt-2">该用户可能已被删除或不存在</p>
        <Button asChild className="mt-4">
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    );
  }

  const videos = data?.pages.flatMap((page) => page.videos) ?? [];

  return (
    <PageWrapper>
      <div className="container py-6">
        {/* 用户信息头部 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start gap-6 mb-8"
        >
          <Avatar className="h-24 w-24 ring-4 ring-primary/20">
            <AvatarImage src={user.avatar || undefined} />
            <AvatarFallback className="text-2xl">
              {(user.nickname || user.username).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {user.nickname || user.username}
            </h1>
            <p className="text-muted-foreground">@{user.username}</p>

            {user.bio && (
              <p className="mt-3 text-sm text-muted-foreground max-w-md">
                {user.bio}
              </p>
            )}

            <div className="flex items-center gap-6 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Video className="h-4 w-4" />
                {user._count.videos} 视频
              </span>
              <span className="flex items-center gap-1">
                <Heart className="h-4 w-4" />
                {user._count.likes} 点赞
              </span>
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4" />
                {user._count.favorites} 收藏
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatRelativeTime(user.createdAt)} 加入
              </span>
            </div>
          </div>
        </motion.div>

        <Separator className="my-6" />

        {/* 用户视频列表 */}
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xl font-semibold mb-6"
        >
          发布的视频
        </motion.h2>

        {videosLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <EmptyState
            icon={Video}
            title="暂无视频"
            description="该用户还没有发布任何视频"
          />
        ) : (
          <>
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            >
              {videos.map((video, index) => (
                <motion.div key={video.id} variants={staggerItem}>
                  <VideoCard video={video} index={index} />
                </motion.div>
              ))}
            </motion.div>

            <div ref={ref} className="flex justify-center py-8">
              {isFetchingNextPage && (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              )}
            </div>
          </>
        )}
      </div>
    </PageWrapper>
  );
}
