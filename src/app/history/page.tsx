"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
import { History, Loader2, Trash2, X, CheckSquare, Eye, Clock } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import Image from "next/image";
import { formatViews, formatRelativeTime } from "@/lib/format";

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { ref, inView } = useInView();
  const utils = trpc.useUtils();

  // 选择模式
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.video.getHistory.useInfiniteQuery(
    { limit: 20 },
    {
      enabled: !!session,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const removeHistoryItemMutation = trpc.video.removeHistoryItem.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.video.getHistory.invalidate();
    },
    onError: () => {
      toast.error("操作失败");
    },
  });

  const batchRemoveHistoryMutation = trpc.video.batchRemoveHistory.useMutation({
    onSuccess: (data) => {
      toast.success(`已删除 ${data.count} 条记录`);
      setSelectedIds(new Set());
      setSelectMode(false);
      utils.video.getHistory.invalidate();
    },
    onError: () => {
      toast.error("操作失败");
    },
  });

  const clearHistoryMutation = trpc.video.clearHistory.useMutation({
    onSuccess: () => {
      toast.success("观看历史已清空");
      utils.video.getHistory.invalidate();
    },
    onError: () => {
      toast.error("清空失败");
    },
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/history");
    }
  }, [status, router]);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (status === "loading" || isLoading) {
    return (
      <div className="px-4 md:px-6 py-6">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const history = data?.pages.flatMap((page) => page.history) ?? [];

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === history.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(history.map(v => v.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    batchRemoveHistoryMutation.mutate({ videoIds: Array.from(selectedIds) });
  };

  // 按日期分组
  const groupByDate = (items: typeof history) => {
    const groups: { date: string; label: string; items: typeof history }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    items.forEach((item) => {
      const itemDate = new Date(item.watchedAt);
      itemDate.setHours(0, 0, 0, 0);
      
      let label: string;
      let dateKey: string;
      
      if (itemDate.getTime() === today.getTime()) {
        label = "今天";
        dateKey = "today";
      } else if (itemDate.getTime() === yesterday.getTime()) {
        label = "昨天";
        dateKey = "yesterday";
      } else if (itemDate.getTime() > thisWeek.getTime()) {
        label = "本周";
        dateKey = "week";
      } else {
        label = itemDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
        dateKey = itemDate.toISOString().split("T")[0];
      }

      const existingGroup = groups.find(g => g.date === dateKey);
      if (existingGroup) {
        existingGroup.items.push(item);
      } else {
        groups.push({ date: dateKey, label, items: [item] });
      }
    });

    return groups;
  };

  const groupedHistory = groupByDate(history);

  return (
    <div className="px-4 md:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <History className="h-8 w-8 text-blue-500" />
          <h1 className="text-2xl font-bold">观看历史</h1>
          {history.length > 0 && (
            <span className="text-muted-foreground">({history.length})</span>
          )}
        </div>

        {history.length > 0 && (
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                  <CheckSquare className="h-4 w-4 mr-1" />
                  {selectedIds.size === history.length ? "取消全选" : "全选"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={selectedIds.size === 0 || batchRemoveHistoryMutation.isPending}
                    >
                      {batchRemoveHistoryMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                      )}
                      删除 ({selectedIds.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>删除历史记录</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定要删除选中的 {selectedIds.size} 条历史记录吗？
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBatchDelete}>确定</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" size="sm" onClick={() => {
                  setSelectMode(false);
                  setSelectedIds(new Set());
                }}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
                  管理
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Trash2 className="h-4 w-4 mr-1" />
                      清空全部
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确定要清空观看历史吗？</AlertDialogTitle>
                      <AlertDialogDescription>
                        此操作不可撤销，所有观看记录将被永久删除。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => clearHistoryMutation.mutate()}
                        disabled={clearHistoryMutation.isPending}
                      >
                        {clearHistoryMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        确定清空
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        )}
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon={History}
          title="还没有观看任何视频"
          description="开始探索精彩的 ACGN 内容吧"
          action={{
            label: "去发现视频",
            onClick: () => router.push("/"),
          }}
        />
      ) : (
        <>
          {groupedHistory.map((group) => (
            <div key={group.date} className="mb-6">
              <h2 className="text-sm font-medium text-muted-foreground mb-3 sticky top-16 bg-background py-2 z-10">
                {group.label}
              </h2>
              <div className="space-y-3">
                {group.items.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    {/* 选择框 */}
                    {selectMode && (
                      <Checkbox
                        checked={selectedIds.has(video.id)}
                        onCheckedChange={() => toggleSelect(video.id)}
                        className="shrink-0"
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
                          <History className="h-8 w-8 text-muted-foreground" />
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
                      <Link
                        href={`/video/${video.id}`}
                        className="font-medium hover:text-primary line-clamp-2"
                      >
                        {video.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <Link href={`/user/${video.uploader.id}`} className="hover:text-primary">
                          {video.uploader.nickname || video.uploader.username}
                        </Link>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {formatViews(video.views)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(video.watchedAt)}
                        </span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    {!selectMode && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => removeHistoryItemMutation.mutate({ videoId: video.id })}
                        disabled={removeHistoryItemMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

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
