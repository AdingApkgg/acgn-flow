"use client";

import { use, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { VideoPlayer } from "@/components/video/video-player";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, ThumbsDown, HelpCircle, Star, Share2, Eye, Calendar, Edit, MoreVertical, Trash2 } from "lucide-react";
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
import { useRouter } from "next/navigation";
import { formatViews, formatRelativeTime } from "@/lib/format";
import { toast } from "sonner";
import Link from "next/link";
import { ArtalkComments } from "@/components/comment/artalk-comments";

interface VideoPageProps {
  params: Promise<{ id: string }>;
}

export default function VideoPage({ params }: VideoPageProps) {
  const { id } = use(params);
  const { data: session } = useSession();
  const router = useRouter();

  const { data: video, isLoading } = trpc.video.getById.useQuery({ id });
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

  const isOwner = session?.user?.id === video?.uploader?.id;
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
    // 确保只在 session 和 video 都加载完成后记录一次
    if (session?.user && video && historyRecordedRef.current !== id) {
      historyRecordedRef.current = id;
      recordHistoryMutation.mutate({ videoId: id, progress: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session?.user, video]);

  // 更新观看进度（每 30 秒更新一次）
  const lastProgressUpdateRef = useRef(0);
  const handleProgress = useCallback(
    (progress: { played: number; playedSeconds: number }) => {
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

  if (isLoading) {
    return (
      <div className="container py-6">
        <Skeleton className="aspect-video w-full rounded-lg" />
        <div className="mt-4 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!video) {
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

  return (
    <div className="container py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <VideoPlayer
            url={video.videoUrl}
            poster={video.coverUrl}
            onProgress={handleProgress}
          />

          <div>
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-xl font-bold">{video.title}</h1>
              
              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
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
                            视频 &ldquo;{video.title}&rdquo; 将被删除，此操作不可撤销。
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

            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {formatViews(video.views)} 次观看
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatRelativeTime(video.createdAt)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Link
              href={`/user/${video.uploader.id}`}
              className="flex items-center gap-3 hover:opacity-80"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={video.uploader.avatar || undefined} />
                <AvatarFallback>
                  {(video.uploader.nickname || video.uploader.username)
                    .charAt(0)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">
                  {video.uploader.nickname || video.uploader.username}
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={status?.liked ? "default" : "outline"}
                size="sm"
                onClick={handleLike}
                disabled={likeMutation.isPending}
                className={status?.liked ? "bg-green-600 hover:bg-green-700" : ""}
              >
                <Heart
                  className={`h-4 w-4 mr-1 ${status?.liked ? "fill-current" : ""}`}
                />
                {video._count.likes}
              </Button>
              <Button
                variant={status?.confused ? "default" : "outline"}
                size="sm"
                onClick={handleConfused}
                disabled={confusedMutation.isPending}
                className={status?.confused ? "bg-yellow-600 hover:bg-yellow-700" : ""}
              >
                <HelpCircle
                  className={`h-4 w-4 mr-1 ${status?.confused ? "fill-current" : ""}`}
                />
                {video._count.confused}
              </Button>
              <Button
                variant={status?.disliked ? "default" : "outline"}
                size="sm"
                onClick={handleDislike}
                disabled={dislikeMutation.isPending}
                className={status?.disliked ? "bg-red-600 hover:bg-red-700" : ""}
              >
                <ThumbsDown
                  className={`h-4 w-4 mr-1 ${status?.disliked ? "fill-current" : ""}`}
                />
                {video._count.dislikes}
              </Button>
              <Button
                variant={status?.favorited ? "default" : "outline"}
                size="sm"
                onClick={handleFavorite}
                disabled={favoriteMutation.isPending}
              >
                <Star
                  className={`h-4 w-4 mr-1 ${status?.favorited ? "fill-current" : ""}`}
                />
                收藏
              </Button>
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-1" />
                分享
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            {video.category && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">分类:</span>
                <Badge variant="secondary">
                  <Link href={`/category/${video.category.slug}`}>
                    {video.category.name}
                  </Link>
                </Badge>
              </div>
            )}

            {video.tags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">标签:</span>
                {video.tags.map(({ tag }) => (
                  <Badge key={tag.id} variant="outline">
                    <Link href={`/tag/${tag.slug}`}>{tag.name}</Link>
                  </Badge>
                ))}
              </div>
            )}

            {video.description && (
              <div>
                <h3 className="font-medium mb-2">简介</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {video.description}
                </p>
              </div>
            )}
          </div>

          <Separator className="my-6" />

          {/* Artalk 评论区 */}
          <ArtalkComments
            pageKey={`/video/${id}`}
            pageTitle={video.title}
          />
        </div>

        <div className="lg:col-span-1">
          <h3 className="font-medium mb-4">相关推荐</h3>
          <p className="text-sm text-muted-foreground">暂无推荐</p>
        </div>
      </div>
    </div>
  );
}
