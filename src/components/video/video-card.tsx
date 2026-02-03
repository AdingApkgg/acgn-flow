"use client";

import { memo } from "react";
import Link from "next/link";
import { VideoCover } from "./video-cover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Play, Eye, Heart, User, Clock } from "lucide-react";
import { formatDuration, formatViews, formatRelativeTime } from "@/lib/format";

interface VideoCardProps {
  video: {
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
  };
  index?: number;
}

function VideoCardComponent({ video, index = 0 }: VideoCardProps) {
  const uploaderName = video.uploader.nickname || video.uploader.username;
  
  return (
    <div 
      className="group transition-transform duration-300 hover:-translate-y-1"
      style={{ 
        animationDelay: `${index * 50}ms`,
      }}
    >
      <Link href={`/video/${video.id}`} className="block">
        {/* 封面容器 */}
        <div className="relative aspect-video overflow-hidden rounded-xl bg-muted shadow-sm group-hover:shadow-xl transition-shadow duration-300">
          <VideoCover
            coverUrl={video.coverUrl}
            title={video.title}
            className="transition-transform duration-500 ease-out group-hover:scale-105"
          />
          
          {/* 渐变遮罩 - 底部信息区域 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-60 group-hover:opacity-80 transition-opacity duration-300" />
          
          {/* 播放按钮 - 居中 */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
            <div className="bg-white/95 dark:bg-black/80 backdrop-blur-md rounded-full p-3.5 shadow-2xl transition-transform duration-200 ease-out group-hover:scale-110 active:scale-95">
              <Play className="h-6 w-6 text-primary fill-primary" />
            </div>
          </div>

          {/* 时长标签 */}
          {video.duration && (
            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 bg-black/75 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md font-medium">
              <Clock className="h-3 w-3" />
              {formatDuration(video.duration)}
            </div>
          )}

          {/* 统计信息 - 左下角 */}
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-2.5 text-white/90 text-xs">
            <span className="flex items-center gap-1 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded">
              <Eye className="h-3 w-3" />
              {formatViews(video.views)}
            </span>
            <span className="flex items-center gap-1 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded">
              <Heart className="h-3 w-3" />
              {video._count.likes}
            </span>
          </div>
        </div>

        {/* 信息区域 */}
        <div className="flex gap-2 sm:gap-3 mt-3 px-0.5">
          {/* 头像 */}
          <HoverCard openDelay={400} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div
                onClick={(e) => e.preventDefault()}
                className="cursor-pointer flex-shrink-0"
              >
                <Avatar className="h-8 w-8 sm:h-9 sm:w-9 ring-2 ring-background shadow-sm transition-transform duration-200 hover:scale-110">
                  <AvatarImage
                    src={video.uploader.avatar || undefined}
                    alt={uploaderName}
                  />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm font-medium">
                    {uploaderName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
            </HoverCardTrigger>
            <HoverCardContent
              className="w-64 max-w-[calc(100vw-2rem)] sm:w-72"
              side="top"
              align="start"
            >
              <div className="flex gap-3">
                <Avatar className="h-14 w-14 ring-2 ring-primary/20">
                  <AvatarImage
                    src={video.uploader.avatar || undefined}
                    alt={uploaderName}
                  />
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-medium">
                    {uploaderName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">
                    {uploaderName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    @{video.uploader.username}
                  </p>
                  <Link
                    href={`/user/${video.uploader.id}`}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-2 font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <User className="h-3.5 w-3.5" />
                    查看主页
                  </Link>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>

          {/* 标题和作者 */}
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="font-medium line-clamp-2 text-xs sm:text-sm leading-snug group-hover:text-primary transition-colors duration-200">
              {video.title}
            </h3>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground">
              <span className="truncate hover:text-foreground transition-colors">
                {uploaderName}
              </span>
              <span className="text-muted-foreground/50">•</span>
              <span className="flex-shrink-0">{formatRelativeTime(video.createdAt)}</span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

// 使用 memo 优化，避免不必要的重渲染
export const VideoCard = memo(VideoCardComponent, (prevProps, nextProps) => {
  // 仅当视频 ID 或关键数据变化时才重新渲染
  return (
    prevProps.video.id === nextProps.video.id &&
    prevProps.video.views === nextProps.video.views &&
    prevProps.video._count.likes === nextProps.video._count.likes &&
    prevProps.index === nextProps.index
  );
});
