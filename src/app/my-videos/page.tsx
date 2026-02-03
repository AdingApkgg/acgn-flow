"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Video,
  Plus,
  Edit,
  Trash2,
  Eye,
  Heart,
  Loader2,
  ExternalLink,
  MoreVertical,
  Search,
  CheckSquare,
  X,
  MessageSquare,
  Clock,
  Layers,
} from "lucide-react";
import { useInView } from "react-intersection-observer";
import { formatViews, formatRelativeTime } from "@/lib/format";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";
import { EmptyState } from "@/components/ui/empty-state";

const statusMap = {
  PUBLISHED: { label: "已发布", variant: "default" as const, color: "text-green-600" },
  PENDING: { label: "待审核", variant: "secondary" as const, color: "text-yellow-600" },
  REJECTED: { label: "已拒绝", variant: "destructive" as const, color: "text-red-600" },
  DELETED: { label: "已删除", variant: "outline" as const, color: "text-muted-foreground" },
};

type SortBy = "latest" | "views" | "likes";

export default function MyVideosPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const { ref, inView } = useInView();
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PUBLISHED" | "PENDING" | "REJECTED">("ALL");
  const [sortBy, setSortBy] = useState<SortBy>("latest");
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  // 批量删除
  const batchDeleteMutation = trpc.video.batchDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`已删除 ${data.count} 个视频`);
      setSelectedIds(new Set());
      setSelectMode(false);
      utils.video.getMyVideos.invalidate();
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
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

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    batchDeleteMutation.mutate({ ids: Array.from(selectedIds) });
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  if (authStatus === "loading" || isLoading) {
    return (
      <div className="px-4 md:px-6 py-6">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const allVideos = data?.pages.flatMap((page) => page.videos) ?? [];
  
  // 客户端过滤和排序
  let videos = allVideos;
  
  // 搜索过滤
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    videos = videos.filter(v => v.title.toLowerCase().includes(query));
  }
  
  // 排序
  videos = [...videos].sort((a, b) => {
    switch (sortBy) {
      case "views":
        return b.views - a.views;
      case "likes":
        return b._count.likes - a._count.likes;
      case "latest":
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === videos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(videos.map(v => v.id)));
    }
  };

  // 统计数据
  const stats = {
    total: allVideos.length,
    published: allVideos.filter(v => v.status === "PUBLISHED").length,
    pending: allVideos.filter(v => v.status === "PENDING").length,
    totalViews: allVideos.reduce((sum, v) => sum + v.views, 0),
    totalLikes: allVideos.reduce((sum, v) => sum + v._count.likes, 0),
  };

  return (
    <div className="px-4 md:px-6 py-6">
      {/* 头部 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Video className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">我的视频</h1>
            <p className="text-sm text-muted-foreground">
              共 {stats.total} 个视频 · {formatViews(stats.totalViews)} 次播放
            </p>
          </div>
        </div>

        <Button asChild>
          <Link href="/upload">
            <Plus className="h-4 w-4 mr-2" />
            上传视频
          </Link>
        </Button>
      </div>

      {/* 统计卡片 */}
      {allVideos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="p-3 border rounded-lg bg-card">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Video className="h-4 w-4" />
              <span className="text-xs">总视频</span>
            </div>
            <p className="text-xl font-bold">{stats.total}</p>
          </div>
          <div className="p-3 border rounded-lg bg-card">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Eye className="h-4 w-4" />
              <span className="text-xs">总播放</span>
            </div>
            <p className="text-xl font-bold">{formatViews(stats.totalViews)}</p>
          </div>
          <div className="p-3 border rounded-lg bg-card">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Heart className="h-4 w-4" />
              <span className="text-xs">总点赞</span>
            </div>
            <p className="text-xl font-bold">{formatViews(stats.totalLikes)}</p>
          </div>
          <div className="p-3 border rounded-lg bg-card">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <CheckSquare className="h-4 w-4" />
              <span className="text-xs">已发布</span>
            </div>
            <p className="text-xl font-bold">{stats.published}</p>
          </div>
        </div>
      )}

      {/* 工具栏 */}
      {allVideos.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {/* 搜索框 */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索视频..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 状态筛选 */}
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                <SelectItem value="PUBLISHED">已发布</SelectItem>
                <SelectItem value="PENDING">待审核</SelectItem>
                <SelectItem value="REJECTED">已拒绝</SelectItem>
              </SelectContent>
            </Select>

            {/* 排序 */}
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as SortBy)}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">最新发布</SelectItem>
                <SelectItem value="views">播放最多</SelectItem>
                <SelectItem value="likes">点赞最多</SelectItem>
              </SelectContent>
            </Select>

            {/* 管理模式 */}
            {selectMode ? (
              <>
                <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                  {selectedIds.size === videos.length ? "取消全选" : "全选"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={selectedIds.size === 0 || batchDeleteMutation.isPending}
                    >
                      {batchDeleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                      )}
                      删除 ({selectedIds.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>批量删除视频</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定要删除选中的 {selectedIds.size} 个视频吗？此操作不可撤销。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleBatchDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        确定删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIds(new Set());
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
                管理
              </Button>
            )}
          </div>
        </div>
      )}

      {videos.length === 0 && allVideos.length === 0 ? (
        <EmptyState
          icon={Video}
          title="还没有上传任何视频"
          description="分享你喜欢的 ACGN 内容，与大家一起交流"
          action={{
            label: "上传第一个视频",
            onClick: () => router.push("/upload"),
          }}
        />
      ) : videos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>没有找到匹配的视频</p>
          <Button variant="link" onClick={() => setSearchQuery("")}>
            清除搜索
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {videos.map((video) => (
              <div
                key={video.id}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
              >
                {/* 选择框 */}
                {selectMode && (
                  <Checkbox
                    checked={selectedIds.has(video.id)}
                    onCheckedChange={() => toggleSelect(video.id)}
                    className="mt-1 shrink-0"
                  />
                )}

                {/* 封面 */}
                <Link
                  href={`/video/${video.id}`}
                  className="relative w-40 h-24 flex-shrink-0 rounded-md overflow-hidden bg-muted"
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
                  {video.duration && (
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 text-white text-xs rounded">
                      {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, "0")}
                    </div>
                  )}
                </Link>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/video/${video.id}`}
                        className="font-medium hover:text-primary line-clamp-2"
                      >
                        {video.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge 
                          variant={statusMap[video.status as keyof typeof statusMap]?.variant || "outline"}
                          className="text-xs"
                        >
                          {statusMap[video.status as keyof typeof statusMap]?.label || video.status}
                        </Badge>
                        {video.pages && (video.pages as unknown[]).length > 1 && (
                          <Badge variant="outline" className="text-xs">
                            <Layers className="h-3 w-3 mr-1" />
                            {(video.pages as unknown[]).length}P
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {formatViews(video.views)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {video._count.likes}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {video._count.comments || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(video.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    {!selectMode && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/video/${video.id}`} target="_blank">
                              <ExternalLink className="h-4 w-4 mr-2" />
                              查看视频
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/video/edit/${video.id}`}>
                              <Edit className="h-4 w-4 mr-2" />
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
                                <Trash2 className="h-4 w-4 mr-2" />
                                删除视频
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>确定要删除这个视频吗？</AlertDialogTitle>
                                <AlertDialogDescription>
                                  视频「{video.title}」将被删除，此操作不可撤销。
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
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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
