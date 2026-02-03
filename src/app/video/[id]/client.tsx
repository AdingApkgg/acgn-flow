"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { VideoPlayer, type VideoPlayerRef, type DanmakuItem } from "@/components/video/video-player";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, ThumbsDown, HelpCircle, Star, Share2, Eye, Calendar, Edit, MoreVertical, Trash2, List, Play, MessageSquareText, ChevronDown, ChevronUp, Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRouter, useSearchParams } from "next/navigation";
import { formatViews, formatRelativeTime } from "@/lib/format";
import { toast } from "sonner";
import Link from "next/link";
import { CommentSection } from "@/components/comment/comment-section";
import { VideoJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import type { SerializedVideo } from "./page";

interface VideoPageClientProps {
  id: string;
  initialVideo: SerializedVideo;
}

export function VideoPageClient({ id, initialVideo }: VideoPageClientProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const playerRef = useRef<VideoPlayerRef>(null);
  
  // 弹幕列表状态
  const [showDanmakuList, setShowDanmakuList] = useState(true);
  const [danmakuData, setDanmakuData] = useState<DanmakuItem[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const danmakuListRef = useRef<HTMLDivElement>(null);

  // 客户端获取视频数据（用于交互后刷新）
  const { data: video } = trpc.video.getById.useQuery(
    { id },
    {
      staleTime: 30000, // 30秒内不重新请求
      refetchOnMount: false, // 首次挂载时不请求（使用服务端数据）
    }
  );

  // 优先使用客户端数据（包含最新的点赞等），然后是服务端数据
  const displayVideo = video || initialVideo;
  
  // 直接加载弹幕数据（独立于播放器）
  useEffect(() => {
    const danmakuUrl = displayVideo?.danmakuUrl || `/uploads/danmaku/${id}.json`;
    
    const loadDanmaku = async () => {
      try {
        const response = await fetch(danmakuUrl);
        if (!response.ok) return;
        
        const data = await response.json();
        if (Array.isArray(data)) {
          setDanmakuData(data.map((item: DanmakuItem) => ({
            text: item.text || "",
            time: item.time || 0,
            color: item.color || "#FFFFFF",
            mode: item.mode ?? 0,
          })));
        }
      } catch (error) {
        console.error("加载弹幕失败:", error);
      }
    };
    
    loadDanmaku();
  }, [id, displayVideo?.danmakuUrl]);

  // 分P状态管理
  const searchParams = useSearchParams();
  const hasPages = displayVideo?.pages && Array.isArray(displayVideo.pages) && displayVideo.pages.length > 1;
  
  // 从 URL 参数读取当前分P
  const urlPage = searchParams.get("p");
  const initialPage = urlPage ? parseInt(urlPage, 10) : 1;
  
  const [currentPage, setCurrentPage] = useState(initialPage);
  
  // URL 参数变化时同步状态
  useEffect(() => {
    const p = searchParams.get("p");
    const pageNum = p ? parseInt(p, 10) : 1;
    if (pageNum !== currentPage && pageNum >= 1) {
      setCurrentPage(pageNum);
    }
  }, [searchParams, currentPage]);
  
  // 切换分P时更新 URL
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    // 更新 URL 但不刷新页面
    const url = new URL(window.location.href);
    if (page > 1) {
      url.searchParams.set("p", String(page));
    } else {
      url.searchParams.delete("p");
    }
    window.history.replaceState({}, "", url.toString());
  }, []);
  
  // 计算当前视频URL
  const currentVideoUrl = useMemo(() => {
    if (!displayVideo?.videoUrl || !hasPages) return displayVideo?.videoUrl;
    // 替换或添加p参数
    const baseUrl = displayVideo.videoUrl.replace(/[?&]p=\d+/, '');
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}p=${currentPage}`;
  }, [displayVideo?.videoUrl, hasPages, currentPage]);

  // 获取视频所属的合集
  const { data: seriesData } = trpc.series.getByVideoId.useQuery(
    { videoId: id },
    { staleTime: 60000 }
  );

  const { data: status } = trpc.video.getInteractionStatus.useQuery(
    { videoId: id },
    { enabled: !!session }
  );

  const incrementViews = trpc.video.incrementViews.useMutation();
  const likeMutation = trpc.video.like.useMutation();
  const dislikeMutation = trpc.video.dislike.useMutation();
  const confusedMutation = trpc.video.confused.useMutation();
  const recordHistoryMutation = trpc.video.recordHistory.useMutation({
    onError: (error) => {
      console.error("记录观看历史失败:", error.message);
    },
  });
  const deleteMutation = trpc.video.delete.useMutation({
    onSuccess: () => {
      toast.success("视频已删除");
      router.push("/my-videos");
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
    },
  });

  const isOwner = session?.user?.id === displayVideo?.uploader?.id;
  const favoriteMutation = trpc.video.favorite.useMutation();
  const utils = trpc.useUtils();

  // 增加观看次数
  useEffect(() => {
    incrementViews.mutate({ id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 记录观看历史（用户登录时）
  const historyRecordedRef = useRef<string | null>(null);
  useEffect(() => {
    // 确保只在 session 和 displayVideo 都加载完成后记录一次
    if (session?.user && displayVideo && historyRecordedRef.current !== id) {
      historyRecordedRef.current = id;
      recordHistoryMutation.mutate({ videoId: id, progress: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session?.user, displayVideo]);

  // 更新观看进度（每 30 秒更新一次）
  const lastProgressUpdateRef = useRef(0);
  const handleProgress = useCallback(
    (progress: { played: number; playedSeconds: number }) => {
      // 更新当前时间（用于弹幕列表）
      setCurrentTime(progress.playedSeconds);
      
      if (!session) return;
      const now = Date.now();
      // 每 30 秒更新一次进度
      if (now - lastProgressUpdateRef.current > 30000) {
        lastProgressUpdateRef.current = now;
        recordHistoryMutation.mutate({
          videoId: id,
          progress: progress.playedSeconds,
        });
      }
    },
    [id, session, recordHistoryMutation]
  );

  // 弹幕列表自动滚动到当前播放位置（每 3 秒检查一次）
  const scrollInterval = Math.floor(currentTime / 3);
  useEffect(() => {
    if (!showDanmakuList || !danmakuListRef.current || danmakuData.length === 0) return;
    
    // 找到当前时间最近的弹幕索引
    const sortedDanmaku = danmakuData.slice().sort((a, b) => a.time - b.time);
    let nearestIdx = 0;
    for (let i = 0; i < sortedDanmaku.length; i++) {
      if (sortedDanmaku[i].time > currentTime) {
        nearestIdx = Math.max(0, i - 1);
        break;
      }
      nearestIdx = i;
    }
    
    const itemHeight = 36;
    const scrollTop = Math.max(0, nearestIdx * itemHeight - 72);
    danmakuListRef.current.scrollTo({ top: scrollTop, behavior: "smooth" });
  }, [showDanmakuList, scrollInterval, danmakuData, currentTime]);

  const handleLike = async () => {
    if (!session) {
      toast.error("请先登录");
      return;
    }
    try {
      await likeMutation.mutateAsync({ videoId: id });
      utils.video.getById.invalidate({ id });
      utils.video.getInteractionStatus.invalidate({ videoId: id });
    } catch {
      toast.error("操作失败");
    }
  };

  const handleDislike = async () => {
    if (!session) {
      toast.error("请先登录");
      return;
    }
    try {
      await dislikeMutation.mutateAsync({ videoId: id });
      utils.video.getById.invalidate({ id });
      utils.video.getInteractionStatus.invalidate({ videoId: id });
    } catch {
      toast.error("操作失败");
    }
  };

  const handleConfused = async () => {
    if (!session) {
      toast.error("请先登录");
      return;
    }
    try {
      await confusedMutation.mutateAsync({ videoId: id });
      utils.video.getById.invalidate({ id });
      utils.video.getInteractionStatus.invalidate({ videoId: id });
    } catch {
      toast.error("操作失败");
    }
  };

  const handleFavorite = async () => {
    if (!session) {
      toast.error("请先登录");
      return;
    }
    try {
      const result = await favoriteMutation.mutateAsync({ videoId: id });
      toast.success(result.favorited ? "已添加到收藏" : "已取消收藏");
      utils.video.getInteractionStatus.invalidate({ videoId: id });
    } catch {
      toast.error("操作失败");
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for non-HTTPS
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      toast.success("链接已复制");
    } catch {
      toast.error("复制失败，请手动复制链接");
    }
  };

  // 由于有 initialVideo，不需要 loading 状态
  if (!displayVideo) {
    return (
      <div className="container py-12 text-center">
        <h1 className="text-2xl font-bold">视频不存在</h1>
        <p className="text-muted-foreground mt-2">该视频可能已被删除或不存在</p>
        <Button asChild className="mt-4">
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";

  return (
    <>
      {/* SEO 结构化数据 */}
      <VideoJsonLd video={displayVideo} />
      <BreadcrumbJsonLd
        items={[
          { name: "首页", url: baseUrl },
          { name: displayVideo.title, url: `${baseUrl}/video/${displayVideo.id}` },
        ]}
      />

      <div className="px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <VideoPlayer
              ref={playerRef}
              url={currentVideoUrl || displayVideo.videoUrl}
              poster={displayVideo.coverUrl}
              onProgress={handleProgress}
              subtitles={displayVideo.subtitleUrl ? [{ url: displayVideo.subtitleUrl, name: "字幕", default: true }] : []}
              danmakuUrl={displayVideo.danmakuUrl || `/uploads/danmaku/${displayVideo.id}.json`}
            />

          <div>
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-lg sm:text-xl font-bold">{displayVideo.title}</h1>
              
              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="更多操作">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/video/edit/${id}`}>
                        <Edit className="mr-2 h-4 w-4" />
                        编辑视频
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={(e) => e.preventDefault()}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除视频
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>确定要删除这个视频吗？</AlertDialogTitle>
                          <AlertDialogDescription>
                            视频 &ldquo;{displayVideo.title}&rdquo; 将被删除，此操作不可撤销。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate({ id })}
                            disabled={deleteMutation.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            删除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="flex items-center gap-3 sm:gap-4 mt-2 text-xs sm:text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {formatViews(displayVideo.views)} 次观看
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatRelativeTime(displayVideo.createdAt)}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <Link
              href={`/user/${displayVideo.uploader.id}`}
              className="flex items-center gap-3 hover:opacity-80"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={displayVideo.uploader.avatar || undefined} />
                <AvatarFallback>
                  {(displayVideo.uploader.nickname || displayVideo.uploader.username)
                    .charAt(0)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">
                  {displayVideo.uploader.nickname || displayVideo.uploader.username}
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <Button
                variant={status?.liked ? "default" : "outline"}
                size="sm"
                onClick={handleLike}
                disabled={likeMutation.isPending}
                className={`px-2 sm:px-3 ${status?.liked ? "bg-green-600 hover:bg-green-700" : ""}`}
              >
                <Heart
                  className={`h-4 w-4 sm:mr-1 ${status?.liked ? "fill-current" : ""}`}
                />
                <span className="hidden sm:inline">{displayVideo._count.likes}</span>
                <span className="sm:hidden text-xs ml-1">{displayVideo._count.likes}</span>
              </Button>
              <Button
                variant={status?.confused ? "default" : "outline"}
                size="sm"
                onClick={handleConfused}
                disabled={confusedMutation.isPending}
                className={`px-2 sm:px-3 ${status?.confused ? "bg-yellow-600 hover:bg-yellow-700" : ""}`}
              >
                <HelpCircle
                  className={`h-4 w-4 sm:mr-1 ${status?.confused ? "fill-current" : ""}`}
                />
                <span className="hidden sm:inline">{displayVideo._count.confused}</span>
                <span className="sm:hidden text-xs ml-1">{displayVideo._count.confused}</span>
              </Button>
              <Button
                variant={status?.disliked ? "default" : "outline"}
                size="sm"
                onClick={handleDislike}
                disabled={dislikeMutation.isPending}
                className={`px-2 sm:px-3 ${status?.disliked ? "bg-red-600 hover:bg-red-700" : ""}`}
              >
                <ThumbsDown
                  className={`h-4 w-4 sm:mr-1 ${status?.disliked ? "fill-current" : ""}`}
                />
                <span className="hidden sm:inline">{displayVideo._count.dislikes}</span>
                <span className="sm:hidden text-xs ml-1">{displayVideo._count.dislikes}</span>
              </Button>
              <Button
                variant={status?.favorited ? "default" : "outline"}
                size="sm"
                onClick={handleFavorite}
                disabled={favoriteMutation.isPending}
                className="px-2 sm:px-3"
              >
                <Star
                  className={`h-4 w-4 sm:mr-1 ${status?.favorited ? "fill-current" : ""}`}
                />
                <span className="hidden sm:inline">收藏</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleShare} className="px-2 sm:px-3">
                <Share2 className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">分享</span>
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            {displayVideo.tags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">标签:</span>
                {displayVideo.tags.map(({ tag }) => (
                  <Badge key={tag.id} variant="outline">
                    <Link href={`/tag/${tag.slug}`}>{tag.name}</Link>
                  </Badge>
                ))}
              </div>
            )}

            {displayVideo.description && (
              <div>
                <h3 className="font-medium mb-2">简介</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {displayVideo.description}
                </p>
              </div>
            )}
          </div>

          <Separator className="my-6" />

          {/* 评论区 */}
          <CommentSection videoId={id} />
        </div>

        {/* 侧边栏 */}
        <div className="lg:col-span-1 mt-6 lg:mt-0 space-y-6">
          {/* 合集选集 */}
          {seriesData?.series && (
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b">
                <Layers className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">{seriesData.series.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    第 {seriesData.currentEpisode} 集 / 共 {seriesData.series.episodes.length} 集
                  </p>
                </div>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {seriesData.series.episodes.map((ep) => {
                  const isCurrentVideo = ep.video.id === id;
                  return (
                    <Link
                      key={ep.video.id}
                      href={`/video/${ep.video.id}`}
                      className={`flex items-center gap-3 p-3 border-b last:border-b-0 transition-colors ${
                        isCurrentVideo ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="relative w-20 h-12 rounded overflow-hidden bg-muted shrink-0">
                        {ep.video.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ep.video.coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <Play className="h-4 w-4" />
                          </div>
                        )}
                        {isCurrentVideo && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Play className="h-4 w-4 text-white fill-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium ${isCurrentVideo ? "text-primary" : "text-muted-foreground"}`}>
                          第{ep.episodeNum}集
                        </span>
                        <p className={`text-sm truncate ${isCurrentVideo ? "font-medium" : ""}`}>
                          {ep.episodeTitle || ep.video.title}
                        </p>
                        {ep.video.duration && (
                          <p className="text-xs text-muted-foreground">
                            {Math.floor(ep.video.duration / 60)}:{String(ep.video.duration % 60).padStart(2, "0")}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* 分P列表 */}
          {hasPages && displayVideo.pages && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4" />
                <h3 className="font-medium">视频选集</h3>
                <Badge variant="secondary" className="text-xs">
                  {(displayVideo.pages as { page: number; title: string }[]).length}P
                </Badge>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-lg p-2">
                {(displayVideo.pages as { page: number; title: string }[]).map((page) => (
                  <button
                    key={page.page}
                    onClick={() => handlePageChange(page.page)}
                    className={`w-full flex items-center gap-2 p-2 rounded text-left text-sm transition-colors ${
                      currentPage === page.page
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    {currentPage === page.page && (
                      <Play className="h-3 w-3 shrink-0 fill-current" />
                    )}
                    <span className={`shrink-0 ${currentPage === page.page ? "" : "text-muted-foreground"}`}>
                      P{page.page}
                    </span>
                    <span className="truncate">{page.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 弹幕列表 */}
          {danmakuData.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => setShowDanmakuList(!showDanmakuList)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4" />
                  <span className="font-medium text-sm">弹幕列表</span>
                  <span className="text-xs text-muted-foreground">({danmakuData.length})</span>
                </div>
                {showDanmakuList ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {showDanmakuList && (
                <div
                  ref={danmakuListRef}
                  className="overflow-y-auto max-h-[300px]"
                >
                  {danmakuData
                    .slice()
                    .sort((a, b) => a.time - b.time)
                    .map((danmaku, idx) => {
                      const isNear = Math.abs(danmaku.time - currentTime) < 3;
                      const isPast = danmaku.time < currentTime;
                      return (
                        <button
                          key={idx}
                          className={`w-full px-4 py-2 text-left text-sm hover:bg-muted/50 transition-colors flex items-start gap-2 border-t border-border/50 ${
                            isNear ? "bg-primary/10" : ""
                          } ${isPast && !isNear ? "text-muted-foreground" : ""}`}
                          onClick={() => {
                            playerRef.current?.seekTo(danmaku.time);
                          }}
                        >
                          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 w-10">
                            {formatDanmakuTime(danmaku.time)}
                          </span>
                          <span
                            className="truncate"
                            style={{ color: danmaku.color || undefined }}
                          >
                            {danmaku.text}
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* 推荐视频 */}
          <RecommendedVideosContent videoId={id} />
        </div>
      </div>
    </div>
    </>
  );
}

// 格式化弹幕时间
function formatDanmakuTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// 推荐视频组件
function RecommendedVideosContent({ videoId }: { videoId: string }) {
  const { data: recommendations, isLoading } = trpc.video.getRecommendations.useQuery(
    { videoId, limit: 10 },
    { enabled: !!videoId }
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="font-medium">相关推荐</h3>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="w-32 h-20 sm:w-40 sm:h-24 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return (
      <div>
        <h3 className="font-medium mb-4">相关推荐</h3>
        <p className="text-sm text-muted-foreground">暂无相关推荐</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium">相关推荐</h3>
      <div className="space-y-3">
        {recommendations.map((video) => (
          <Link
            key={video.id}
            href={`/video/${video.id}`}
            className="flex gap-3 group"
          >
            {/* 封面 */}
            <div className="relative w-32 h-20 sm:w-40 sm:h-24 rounded-lg overflow-hidden bg-muted shrink-0">
              {video.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.coverUrl}
                  alt={video.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <Eye className="h-8 w-8" />
                </div>
              )}
              {video.duration && (
                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded">
                  {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, "0")}
                </div>
              )}
            </div>

            {/* 信息 */}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs sm:text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
                {video.title}
              </h4>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                {video.uploader.nickname || video.uploader.username}
              </p>
              <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground mt-1">
                <span>{formatViews(video.views)} 次播放</span>
                <span>·</span>
                <span>{formatRelativeTime(video.createdAt)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
