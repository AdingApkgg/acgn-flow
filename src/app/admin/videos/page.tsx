"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
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
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Calendar,
  Clock,
  Tag,
  MessageSquare,
  Star,
  Edit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime, formatDuration } from "@/lib/format";

type VideoStatus = "PENDING" | "PUBLISHED" | "REJECTED";

interface VideoItem {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  duration: number | null;
  views: number;
  status: string;
  sources: { url: string }[] | null;
  createdAt: Date;
  uploader: {
    id: string;
    username: string;
    nickname: string | null;
    avatar: string | null;
  };
  tags: { tag: { id: string; name: string } }[];
  _count: {
    likes: number;
    favorites: number;
    comments: number;
  };
}

export default function AdminVideosPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | VideoStatus>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [batchAction, setBatchAction] = useState<"delete" | null>(null);

  const utils = trpc.useUtils();

  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();
  const { data: stats } = trpc.admin.getVideoStats.useQuery(undefined, {
    enabled: permissions?.scopes.includes("video:moderate"),
  });

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
      toast.success(variables.status === "PUBLISHED" ? "视频已通过审核" : "视频已拒绝");
      utils.admin.listAllVideos.invalidate();
      utils.admin.getVideoStats.invalidate();
    },
    onError: (error) => toast.error(error.message || "操作失败"),
  });

  const deleteMutation = trpc.admin.deleteVideo.useMutation({
    onSuccess: () => {
      toast.success("视频已删除");
      utils.admin.listAllVideos.invalidate();
      utils.admin.getVideoStats.invalidate();
      setDeletingId(null);
    },
    onError: (error) => toast.error(error.message || "删除失败"),
  });

  const batchModerateMutation = trpc.admin.batchModerateVideos.useMutation({
    onSuccess: (result) => {
      toast.success(`已处理 ${result.count} 个视频`);
      utils.admin.listAllVideos.invalidate();
      utils.admin.getVideoStats.invalidate();
      setSelectedIds(new Set());
    },
    onError: (error) => toast.error(error.message || "批量操作失败"),
  });

  const batchDeleteMutation = trpc.admin.batchDeleteVideos.useMutation({
    onSuccess: (result) => {
      toast.success(`已删除 ${result.count} 个视频`);
      utils.admin.listAllVideos.invalidate();
      utils.admin.getVideoStats.invalidate();
      setSelectedIds(new Set());
      setBatchAction(null);
    },
    onError: (error) => toast.error(error.message || "批量删除失败"),
  });

  const videos = useMemo(
    () => (data?.pages.flatMap((page) => page.videos) || []) as unknown as VideoItem[],
    [data?.pages]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === videos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(videos.map((v) => v.id)));
    }
  }, [videos, selectedIds.size]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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
      {/* 标题和统计 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          <h1 className="text-xl font-semibold">视频管理</h1>
        </div>

        {stats && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">总计</span>
              <Badge variant="outline">{stats.total}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">已发布</span>
              <Badge className="bg-green-500">{stats.published}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">待审核</span>
              <Badge variant="secondary">{stats.pending}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">已拒绝</span>
              <Badge variant="destructive">{stats.rejected}</Badge>
            </div>
          </div>
        )}
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-md">
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

      {/* 批量操作栏 */}
      {videos.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSelectAll}
            className="gap-1"
          >
            {selectedIds.size === videos.length && videos.length > 0 ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {selectedIds.size === videos.length && videos.length > 0 ? "取消全选" : "全选"}
          </Button>

          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                已选 {selectedIds.size} 个
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-green-600"
                  onClick={() =>
                    batchModerateMutation.mutate({
                      videoIds: Array.from(selectedIds),
                      status: "PUBLISHED",
                    })
                  }
                  disabled={batchModerateMutation.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  批量通过
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-orange-600"
                  onClick={() =>
                    batchModerateMutation.mutate({
                      videoIds: Array.from(selectedIds),
                      status: "REJECTED",
                    })
                  }
                  disabled={batchModerateMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  批量拒绝
                </Button>
                {canManage && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setBatchAction("delete")}
                    disabled={batchDeleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    批量删除
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 视频列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            没有找到视频
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {videos.map((video) => {
            const isSelected = selectedIds.has(video.id);
            const isExpanded = expandedIds.has(video.id);

            return (
              <Card
                key={video.id}
                className={cn(
                  "transition-colors",
                  isSelected && "ring-2 ring-primary"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(video.id)}
                      className="mt-1"
                    />

                    {/* 封面 */}
                    <div className="relative w-40 h-24 rounded-lg bg-muted overflow-hidden shrink-0">
                      {video.coverUrl ? (
                        <Image
                          src={video.coverUrl}
                          alt={video.title}
                          fill
                          className="object-cover"
                          sizes="160px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      {video.duration && (
                        <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 py-0.5 rounded">
                          {formatDuration(video.duration)}
                        </div>
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
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
                                {(video.uploader.nickname || video.uploader.username).charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <Link href={`/user/${video.uploader.id}`} className="hover:underline">
                              {video.uploader.nickname || video.uploader.username}
                            </Link>
                            <span>·</span>
                            <span>{formatRelativeTime(video.createdAt)}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {video.views}
                            </span>
                            <span className="flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {video._count.likes}
                            </span>
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              {video._count.favorites}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {video._count.comments}
                            </span>
                          </div>
                        </div>
                        {getStatusBadge(video.status as VideoStatus)}
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-1 mt-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/video/${video.id}`} target="_blank">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            查看
                          </Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/video/edit/${video.id}`}>
                            <Edit className="h-3 w-3 mr-1" />
                            编辑
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 ml-auto"
                          onClick={() => toggleExpand(video.id)}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* 展开的详细信息 */}
                  <Collapsible open={isExpanded}>
                    <CollapsibleContent>
                      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <div className="font-medium text-foreground mb-1">视频 ID</div>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">{video.id}</code>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              创建时间
                            </div>
                            {new Date(video.createdAt).toLocaleString("zh-CN")}
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              时长
                            </div>
                            {video.duration ? formatDuration(video.duration) : "-"}
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">分P数</div>
                            {video.sources?.length || 1}
                          </div>
                        </div>

                        {video.description && (
                          <div>
                            <div className="font-medium text-foreground mb-1">描述</div>
                            <p className="text-sm whitespace-pre-wrap">{video.description}</p>
                          </div>
                        )}

                        {video.tags && video.tags.length > 0 && (
                          <div>
                            <div className="font-medium text-foreground mb-1 flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              标签
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {video.tags.map((t) => (
                                <Badge key={t.tag.id} variant="outline" className="text-xs">
                                  {t.tag.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            );
          })}

          {hasNextPage && (
            <div className="flex justify-center pt-4">
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
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量删除确认对话框 */}
      <AlertDialog open={batchAction === "delete"} onOpenChange={() => setBatchAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定批量删除吗？</AlertDialogTitle>
            <AlertDialogDescription className="text-destructive">
              将永久删除 {selectedIds.size} 个视频及其所有关联数据，此操作不可恢复！
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => batchDeleteMutation.mutate({ videoIds: Array.from(selectedIds) })}
            >
              永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
