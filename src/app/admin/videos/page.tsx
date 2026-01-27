"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import {
  Video,
  Search,
  Eye,
  Heart,
  CheckCircle,
  XCircle,
  Trash2,
  Loader2,
  ExternalLink,
} from "lucide-react";

type VideoStatus = "PENDING" | "PUBLISHED" | "REJECTED";

export default function AdminVideosPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | VideoStatus>("ALL");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.admin.listAllVideos.useInfiniteQuery(
      { limit: 20, search: search || undefined, status: statusFilter },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        enabled: permissions?.scopes.includes("video:moderate"),
      }
    );

  const moderateMutation = trpc.admin.moderateVideo.useMutation({
    onSuccess: (_, variables) => {
      toast.success(
        variables.status === "PUBLISHED" ? "视频已通过审核" : "视频已拒绝"
      );
      utils.admin.listAllVideos.invalidate();
    },
    onError: (error) => {
      toast.error("操作失败", { description: error.message });
    },
  });

  const deleteMutation = trpc.admin.deleteVideo.useMutation({
    onSuccess: () => {
      toast.success("视频已删除");
      utils.admin.listAllVideos.invalidate();
      setDeletingId(null);
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
    },
  });

  const videos = data?.pages.flatMap((page) => page.videos) || [];

  const getStatusBadge = (status: VideoStatus) => {
    switch (status) {
      case "PUBLISHED":
        return <Badge className="bg-green-500">已发布</Badge>;
      case "PENDING":
        return <Badge variant="secondary">待审核</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">已拒绝</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const canModerate = permissions?.scopes.includes("video:moderate");
  const canManage = permissions?.scopes.includes("video:manage");

  if (!canModerate) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        您没有视频管理权限
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Video className="h-6 w-6" />
          视频管理
        </h1>
        <p className="text-muted-foreground mt-1">
          审核和管理网站视频内容
        </p>
      </motion.div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索视频标题或描述..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                <SelectItem value="PENDING">待审核</SelectItem>
                <SelectItem value="PUBLISHED">已发布</SelectItem>
                <SelectItem value="REJECTED">已拒绝</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 视频列表 */}
      <Card>
        <CardHeader>
          <CardTitle>视频列表</CardTitle>
          <CardDescription>
            共 {videos.length} 个视频{hasNextPage && "（加载更多...）"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array(5)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-20 w-32 rounded-lg" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              没有找到视频
            </div>
          ) : (
            <div className="space-y-4">
              {videos.map((video, index) => (
                <motion.div
                  key={video.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  {/* 封面 */}
                  <div className="relative w-32 h-20 rounded-lg bg-muted overflow-hidden shrink-0">
                    {video.coverUrl ? (
                      <Image
                        src={video.coverUrl}
                        alt={video.title}
                        fill
                        className="object-cover"
                        sizes="128px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/video/${video.id}`}
                          className="font-medium hover:underline line-clamp-1"
                        >
                          {video.title}
                        </Link>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={video.uploader.avatar || undefined} />
                            <AvatarFallback className="text-xs">
                              {(video.uploader.nickname || video.uploader.username)
                                .charAt(0)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span>{video.uploader.nickname || video.uploader.username}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {video.views}
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" />
                            {video._count.likes}
                          </span>
                        </div>
                      </div>
                      {getStatusBadge(video.status as VideoStatus)}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2 mt-2">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/video/${video.id}`} target="_blank">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          查看
                        </Link>
                      </Button>
                      {video.status !== "PUBLISHED" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-green-600"
                          onClick={() =>
                            moderateMutation.mutate({
                              videoId: video.id,
                              status: "PUBLISHED",
                            })
                          }
                          disabled={moderateMutation.isPending}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          通过
                        </Button>
                      )}
                      {video.status !== "REJECTED" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-orange-600"
                          onClick={() =>
                            moderateMutation.mutate({
                              videoId: video.id,
                              status: "REJECTED",
                            })
                          }
                          disabled={moderateMutation.isPending}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          拒绝
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeletingId(video.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          删除
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}

              {hasNextPage && (
                <div className="text-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    加载更多
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要删除这个视频吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销，视频及其所有关联数据将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteMutation.mutate({ videoId: deletingId })}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
