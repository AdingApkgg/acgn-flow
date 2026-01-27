"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { VideoCover } from "./video-cover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Play, Eye, Heart, User } from "lucide-react";
import { formatDuration, formatViews, formatRelativeTime } from "@/lib/format";
import { motion } from "framer-motion";

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

export function VideoCard({ video, index = 0 }: VideoCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Link href={`/video/${video.id}`}>
        <Card className="group overflow-hidden border-0 bg-transparent hover:bg-accent/50 transition-all duration-300">
          {/* Thumbnail */}
          <div className="relative aspect-video overflow-hidden rounded-lg">
            <VideoCover
              coverUrl={video.coverUrl}
              title={video.title}
              className="transition-transform duration-500 group-hover:scale-110"
            />
            
            {/* Play overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <motion.div 
                className="bg-primary/90 backdrop-blur-sm rounded-full p-4 shadow-lg"
                initial={{ scale: 0.8, opacity: 0 }}
                whileHover={{ scale: 1.1 }}
                animate={{ scale: 1 }}
              >
                <Play className="h-8 w-8 text-primary-foreground fill-current" />
              </motion.div>
            </div>

            {/* Duration */}
            {video.duration && (
              <motion.div 
                className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md font-medium"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                {formatDuration(video.duration)}
              </motion.div>
            )}

          </div>

          {/* Info */}
          <CardContent className="p-3">
            <div className="flex gap-3">
              <HoverCard openDelay={300} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    transition={{ duration: 0.2 }}
                    onClick={(e) => e.preventDefault()}
                    className="cursor-pointer"
                  >
                    <Avatar className="h-9 w-9 flex-shrink-0 ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
                      <AvatarImage
                        src={video.uploader.avatar || undefined}
                        alt={video.uploader.nickname || video.uploader.username}
                      />
                      <AvatarFallback>
                        {(video.uploader.nickname || video.uploader.username)
                          .charAt(0)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                </HoverCardTrigger>
                <HoverCardContent className="w-64" side="top" align="start">
                  <div className="flex gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage
                        src={video.uploader.avatar || undefined}
                        alt={video.uploader.nickname || video.uploader.username}
                      />
                      <AvatarFallback>
                        {(video.uploader.nickname || video.uploader.username)
                          .charAt(0)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {video.uploader.nickname || video.uploader.username}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        @{video.uploader.username}
                      </p>
                      <Link
                        href={`/user/${video.uploader.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <User className="h-3 w-3" />
                        查看主页
                      </Link>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>

              <div className="flex-1 min-w-0">
                <h3 className="font-medium line-clamp-2 text-sm leading-snug group-hover:text-primary transition-colors duration-200">
                  {video.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 group-hover:text-foreground/70 transition-colors">
                  {video.uploader.nickname || video.uploader.username}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {formatViews(video.views)}
                  </span>
                  <span className="flex items-center gap-1 group-hover:text-red-400 transition-colors">
                    <Heart className="h-3 w-3" />
                    {video._count.likes}
                  </span>
                  <span>{formatRelativeTime(video.createdAt)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
