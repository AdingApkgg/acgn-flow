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
import { Star, Loader2, Trash2, X, CheckSquare, Eye, Heart } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import Image from "next/image";
import { formatViews, formatRelativeTime } from "@/lib/format";

export default function FavoritesPage() {
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
  } = trpc.video.getFavorites.useInfiniteQuery(
    { limit: 20 },
    {
      enabled: !!session,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const unfavoriteMutation = trpc.video.unfavorite.useMutation({
    onSuccess: () => {
      toast.success("已取消收藏");
      utils.video.getFavorites.invalidate();
    },
    onError: () => {
      toast.error("操作失败");
    },
  });

  const batchUnfavoriteMutation = trpc.video.batchUnfavorite.useMutation({
    onSuccess: (data) => {
      toast.success(`已取消收藏 ${data.count} 个视频`);
      setSelectedIds(new Set());
      setSelectMode(false);
      utils.video.getFavorites.invalidate();
    },
    onError: () => {
      toast.error("操作失败");
    },
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/favorites");
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

  const favorites = data?.pages.flatMap((page) => page.favorites) ?? [];

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
    if (selectedIds.size === favorites.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(favorites.map(v => v.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    batchUnfavoriteMutation.mutate({ videoIds: Array.from(selectedIds) });
  };

  return (
    <div className="px-4 md:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Star className="h-8 w-8 text-yellow-500" />
          <h1 className="text-2xl font-bold">我的收藏</h1>
          {favorites.length > 0 && (
            <span className="text-muted-foreground">({favorites.length})</span>
          )}
        </div>

        {favorites.length > 0 && (
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                  <CheckSquare className="h-4 w-4 mr-1" />
                  {selectedIds.size === favorites.length ? "取消全选" : "全选"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={selectedIds.size === 0 || batchUnfavoriteMutation.isPending}
                    >
                      {batchUnfavoriteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                      )}
                      删除 ({selectedIds.size})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>取消收藏</AlertDialogTitle>
                      <AlertDialogDescription>
                        确定要取消收藏选中的 {selectedIds.size} 个视频吗？
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
              <Button variant="outline" size="sm" onClick={() => setSelectMode(true)}>
                管理
              </Button>
            )}
          </div>
        )}
      </div>

      {favorites.length === 0 ? (
        <EmptyState
          icon={Star}
          title="还没有收藏任何视频"
          description="发现喜欢的视频后，点击收藏按钮即可添加到这里"
          action={{
            label: "去发现视频",
            onClick: () => router.push("/"),
          }}
        />
      ) : (
        <>
          <div className="space-y-3">
            {favorites.map((video) => (
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
                      <Star className="h-8 w-8 text-muted-foreground" />
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
                      <Heart className="h-3 w-3" />
                      {video._count.likes}
                    </span>
                    <span>{formatRelativeTime(video.createdAt)}</span>
                  </div>
                </div>

                {/* 操作按钮 */}
                {!selectMode && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={() => unfavoriteMutation.mutate({ videoId: video.id })}
                    disabled={unfavoriteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                )}
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
