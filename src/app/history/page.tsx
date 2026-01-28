"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { VideoCard } from "@/components/video/video-card";
import { Button } from "@/components/ui/button";
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
import { History, Loader2, Trash2 } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";

export default function HistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { ref, inView } = useInView();
  const utils = trpc.useUtils();

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
      <div className="container py-6">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const history = data?.pages.flatMap((page) => page.history) ?? [];

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <History className="h-8 w-8 text-blue-500" />
          <h1 className="text-2xl font-bold">观看历史</h1>
        </div>

        {history.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                清空历史
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {history.map((video) => (
              <div key={video.id}>
                <VideoCard video={video} />
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
