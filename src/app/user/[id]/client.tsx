"use client";

import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { VideoCard } from "@/components/video/video-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Calendar, Video, Heart, Star, Loader2, MapPin, Globe, ExternalLink, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useInView } from "react-intersection-observer";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/format";
import Link from "next/link";
import type { SerializedUser } from "./page";

// 社交图标组件
function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

function BilibiliIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.659.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906L17.813 4.653zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773H5.333zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function PixivIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M4.935 0A4.924 4.924 0 0 0 0 4.935v14.13A4.924 4.924 0 0 0 4.935 24h14.13A4.924 4.924 0 0 0 24 19.065V4.935A4.924 4.924 0 0 0 19.065 0zm7.81 4.547c2.181 0 4.058.676 5.399 1.847a6.118 6.118 0 0 1 2.116 4.66c.005 1.854-.88 3.476-2.257 4.563-1.375 1.092-3.225 1.697-5.258 1.697-2.314 0-4.46-.842-4.46-.842v2.718c.397.116 1.048.365.635.779H5.79c-.413-.414.204-.663.601-.779V7.666c-.397-.116-1.014-.365-.601-.779h2.28s1.593.842 3.676.842zm-.186 1.477c-1.283 0-2.34.287-3.176.664v7.853c.837.378 1.893.665 3.176.665 2.95 0 4.66-1.937 4.66-4.56 0-2.623-1.71-4.622-4.66-4.622z" />
    </svg>
  );
}

const SOCIAL_CONFIGS: Record<string, { 
  icon: React.ComponentType<{ className?: string }>;
  getUrl: (value: string) => string;
  color: string;
}> = {
  twitter: {
    icon: TwitterIcon,
    getUrl: (v) => v.startsWith("http") ? v : `https://twitter.com/${v.replace("@", "")}`,
    color: "hover:text-[#1DA1F2]",
  },
  github: {
    icon: GitHubIcon,
    getUrl: (v) => v.startsWith("http") ? v : `https://github.com/${v}`,
    color: "hover:text-[#333] dark:hover:text-white",
  },
  discord: {
    icon: DiscordIcon,
    getUrl: (v) => v.startsWith("http") ? v : `https://discord.com/users/${v}`,
    color: "hover:text-[#5865F2]",
  },
  bilibili: {
    icon: BilibiliIcon,
    getUrl: (v) => v.startsWith("http") ? v : `https://space.bilibili.com/${v}`,
    color: "hover:text-[#00A1D6]",
  },
  youtube: {
    icon: YouTubeIcon,
    getUrl: (v) => v.startsWith("http") ? v : `https://youtube.com/${v}`,
    color: "hover:text-[#FF0000]",
  },
  pixiv: {
    icon: PixivIcon,
    getUrl: (v) => v.startsWith("http") ? v : `https://pixiv.net/users/${v}`,
    color: "hover:text-[#0096FA]",
  },
};

function SocialLinks({ socialLinks }: { socialLinks: Record<string, string> | null }) {
  if (!socialLinks) return null;
  return (
    <>
      {Object.entries(socialLinks).map(([key, value]) => {
        if (!value) return null;
        const config = SOCIAL_CONFIGS[key];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <a
            key={key}
            href={config.getUrl(value)}
            target="_blank"
            rel="noopener noreferrer"
            className={`p-2 rounded-full bg-muted/50 transition-colors ${config.color}`}
            title={key.charAt(0).toUpperCase() + key.slice(1)}
          >
            <Icon className="h-4 w-4" />
          </a>
        );
      })}
    </>
  );
}

interface UserPageClientProps {
  id: string;
  initialUser: SerializedUser | null;
}

export function UserPageClient({ id, initialUser }: UserPageClientProps) {
  const { ref, inView } = useInView();

  // 客户端获取用户数据
  const { data: user, isLoading: userLoading } = trpc.user.getProfile.useQuery(
    { id },
    {
      staleTime: initialUser ? 60000 : 0,
      refetchOnMount: !initialUser,
    }
  );

  // 优先使用客户端数据，然后是服务端数据
  const displayUser = user || initialUser;

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

  // 用户不存在
  if (!initialUser && !displayUser && !userLoading) {
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

  // 如果没有数据且正在加载，显示骨架屏
  if (!displayUser) {
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

  return (
    <div className="container py-6">
      {/* 用户信息头部 */}
      <div className="flex flex-col sm:flex-row items-start gap-6 mb-8">
          <Avatar className="h-24 w-24 ring-4 ring-primary/20">
            <AvatarImage src={displayUser.avatar || undefined} />
            <AvatarFallback className="text-2xl">
              {(displayUser.nickname || displayUser.username).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">
                {displayUser.nickname || displayUser.username}
              </h1>
              {displayUser.pronouns && (
                <Badge variant="secondary" className="text-xs">
                  {displayUser.pronouns}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">@{displayUser.username}</p>
            <a
              href={`mailto:${displayUser.email}`}
              className="text-sm text-muted-foreground flex items-center gap-1 mt-1 hover:text-primary transition-colors"
            >
              <Mail className="h-3 w-3" />
              {displayUser.email}
            </a>

            {displayUser.bio && (
              <p className="mt-3 text-sm text-muted-foreground max-w-md">
                {displayUser.bio}
              </p>
            )}

            {/* 位置和网站 */}
            <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
              {displayUser.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {displayUser.location}
                </span>
              )}
              {displayUser.website && (
                <a
                  href={displayUser.website.startsWith("http") ? displayUser.website : `https://${displayUser.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <Globe className="h-4 w-4" />
                  {new URL(displayUser.website.startsWith("http") ? displayUser.website : `https://${displayUser.website}`).hostname}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* 社交账号 */}
            {displayUser.socialLinks && typeof displayUser.socialLinks === 'object' && !Array.isArray(displayUser.socialLinks) && Object.values(displayUser.socialLinks).some(v => v) && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <SocialLinks socialLinks={displayUser.socialLinks as Record<string, string>} />
              </div>
            )}

            <div className="flex items-center gap-6 mt-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Video className="h-4 w-4" />
                {displayUser._count.videos} 视频
              </span>
              <span className="flex items-center gap-1">
                <Heart className="h-4 w-4" />
                {displayUser._count.likes} 点赞
              </span>
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4" />
                {displayUser._count.favorites} 收藏
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatRelativeTime(displayUser.createdAt)} 加入
              </span>
            </div>
          </div>
      </div>

        <Separator className="my-6" />

        {/* 用户视频列表 */}
        <h2 className="text-xl font-semibold mb-6">
          发布的视频
        </h2>

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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {videos.map((video, index) => (
                <div key={video.id}>
                  <VideoCard video={video} index={index} />
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
