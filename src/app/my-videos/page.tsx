"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Video,
  Plus,
  Edit,
  Trash2,
  Eye,
  Heart,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useInView } from "react-intersection-observer";
import { formatViews, formatRelativeTime } from "@/lib/format";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";
import { EmptyState } from "@/components/ui/empty-state";

const statusMap = {
  PUBLISHED: { label: "已发布", variant: "default" as const },
  PENDING: { label: "待审核", variant: "secondary" as const },
  REJECTED: { label: "已拒绝", variant: "destructive" as const },
  DELETED: { label: "已删除", variant: "outline" as const },
};

export default function MyVideosPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const { ref, inView } = useInView();
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PUBLISHED" | "PENDING" | "REJECTED">("ALL");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.video.getMyVideos.useInfiniteQuery(
    { limit: 20, status: statusFilter },
    {
      enabled: !!session,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const deleteMutation = trpc.video.delete.useMutation({
    onSuccess: () => {
      toast.success("视频已删除");
      utils.video.getMyVideos.invalidate();
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login?callbackUrl=/my-videos");
    }
  }, [authStatus, router]);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleDelete = (id: string) => {
    setDeletingId(id);
    deleteMutation.mutate({ id });
  };

  if (authStatus === "loading" || isLoading) {
    return (
      <div className="container py-6">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const videos = data?.pages.flatMap((page) => page.videos) ?? [];

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Video className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">我的视频</h1>
        </div>

        <div className="flex items-center gap-4">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部</SelectItem>
              <SelectItem value="PUBLISHED">已发布</SelectItem>
              <SelectItem value="PENDING">待审核</SelectItem>
              <SelectItem value="REJECTED">已拒绝</SelectItem>
            </SelectContent>
          </Select>

          <Button asChild>
            <Link href="/upload">
              <Plus className="h-4 w-4 mr-2" />
              上传视频
            </Link>
          </Button>
        </div>
      </div>

      {videos.length === 0 ? (
        <EmptyState
          icon={Video}
          title="还没有上传任何视频"
          description="分享你喜欢的 ACGN 内容，与大家一起交流"
          action={{
            label: "上传第一个视频",
            onClick: () => router.push("/upload"),
          }}
        />
      ) : (
        <>
          <div className="space-y-4">
            {videos.map((video) => (
              <div
                key={video.id}
                className="flex flex-col sm:flex-row gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                  {/* 封面 */}
                  <Link
                    href={`/video/${video.id}`}
                    className="relative w-full sm:w-40 aspect-video sm:h-24 flex-shrink-0 rounded-md overflow-hidden bg-muted"
                  >
                    {video.coverUrl ? (
                      <Image
                        src={video.coverUrl}
                        alt={video.title}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Video className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </Link>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/video/${video.id}`}
                          className="font-medium hover:text-primary line-clamp-2 sm:line-clamp-1"
                        >
                          {video.title}
                        </Link>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                          <Badge variant={statusMap[video.status as keyof typeof statusMap]?.variant || "outline"}>
                            {statusMap[video.status as keyof typeof statusMap]?.label || video.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 sm:gap-4 mt-2 text-xs sm:text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {formatViews(video.views)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" />
                            {video._count.likes}
                          </span>
                          <span>{formatRelativeTime(video.createdAt)}</span>
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 mt-2 sm:mt-0">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/video/${video.id}`} target="_blank">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/video/edit/${video.id}`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
                                onClick={() => handleDelete(video.id)}
                                disabled={deletingId === video.id}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {deletingId === video.id && (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                )}
                                删除
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
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
