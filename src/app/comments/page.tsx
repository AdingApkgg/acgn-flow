"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageCircle, ArrowUpDown, Send, Sparkles, Play, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { GuestbookItem } from "@/components/guestbook/guestbook-item";
import Link from "next/link";
import { parseDeviceInfo, getHighEntropyDeviceInfo, mergeDeviceInfo, type DeviceInfo } from "@/lib/device-info";
import { getGpsLocation, formatGpsLocation } from "@/lib/geolocation";
import { formatRelativeTime } from "@/lib/format";
import { useIsMounted } from "@/components/motion";

type SortType = "newest" | "oldest" | "popular";

export default function CommentsPage() {
  const { data: session } = useSession();
  const [sort, setSort] = useState<SortType>("newest");
  const [newMessage, setNewMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMounted = useIsMounted();
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [gpsLocation, setGpsLocation] = useState<string | null>(null);

  const utils = trpc.useUtils();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const init = async () => {
      const baseInfo = parseDeviceInfo(navigator.userAgent, {
        platform: navigator.platform || null,
        language: navigator.language || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        screen: `${window.screen.width}x${window.screen.height}`,
        pixelRatio: window.devicePixelRatio || null,
      });
      const highEntropyInfo = await getHighEntropyDeviceInfo();
      const mergedInfo = mergeDeviceInfo(baseInfo, highEntropyInfo);
      setDeviceInfo(mergedInfo);
    };
    init();
  }, []);

  const { data: messageCount } = trpc.guestbook.getCount.useQuery();

  // 全站最新评论流
  const {
    data: recentCommentsData,
    isLoading: recentCommentsLoading,
    fetchNextPage: fetchMoreComments,
    hasNextPage: hasMoreComments,
    isFetchingNextPage: isFetchingMoreComments,
  } = trpc.comment.listRecent.useInfiniteQuery(
    { limit: 10 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const recentComments = recentCommentsData?.pages.flatMap((page) => page.comments) ?? [];

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.guestbook.list.useInfiniteQuery(
    { sort, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const createMutation = trpc.guestbook.create.useMutation({
    onSuccess: () => {
      setNewMessage("");
      utils.guestbook.list.invalidate();
      utils.guestbook.getCount.invalidate();
      toast.success("留言发表成功");
    },
    onError: (error) => {
      toast.error(error.message || "发表失败");
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const handleSubmit = useCallback(async () => {
    if (!newMessage.trim() || isSubmitting) return;
    setIsSubmitting(true);

    let currentDeviceInfo = deviceInfo;
    if (!currentDeviceInfo || currentDeviceInfo.osVersion === "10.15.7") {
      const baseInfo = parseDeviceInfo(navigator.userAgent, {
        platform: navigator.platform || null,
        language: navigator.language || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        screen: `${window.screen.width}x${window.screen.height}`,
        pixelRatio: window.devicePixelRatio || null,
      });
      const highEntropyInfo = await getHighEntropyDeviceInfo();
      currentDeviceInfo = mergeDeviceInfo(baseInfo, highEntropyInfo);
      setDeviceInfo(currentDeviceInfo);
    }

    let currentGps = gpsLocation;
    if (!currentGps) {
      const gps = await getGpsLocation({ reverseGeocode: true, timeout: 8000 });
      if (gps) {
        currentGps = formatGpsLocation(gps);
        setGpsLocation(currentGps);
      }
    }

    createMutation.mutate({
      content: newMessage.trim(),
      gpsLocation: currentGps || undefined,
      deviceInfo: currentDeviceInfo || undefined,
    });
  }, [newMessage, isSubmitting, createMutation, gpsLocation, deviceInfo]);

  const messages = data?.pages.flatMap((page) => page.messages) ?? [];

  return (
    <div className="container py-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <MessageCircle className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">留言板</h1>
          <p className="text-sm text-muted-foreground">
            欢迎留下您的想法和建议
          </p>
        </div>
      </div>

      {/* 全站最新评论流 */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="h-4 w-4" />
            全站评论动态
          </CardTitle>
          <CardDescription>
            来自视频的最新评论
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentCommentsLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/30">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))
            ) : recentComments.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                暂无评论
              </div>
            ) : (
              <>
                {recentComments.map((comment) => (
                  <Link
                    key={comment.id}
                    href={`/video/${comment.video.id}`}
                    className="flex gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={comment.user.avatar || undefined} />
                      <AvatarFallback className="text-xs">
                        {(comment.user.nickname || comment.user.username).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-foreground">
                          {comment.user.nickname || comment.user.username}
                        </span>
                        <span>评论了</span>
                        <span className="text-primary truncate max-w-[150px]">
                          {comment.video.title}
                        </span>
                        <span className="ml-auto shrink-0">
                          {formatRelativeTime(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2">{comment.content}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
                {hasMoreComments && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        fetchMoreComments();
                      }}
                      disabled={isFetchingMoreComments}
                    >
                      {isFetchingMoreComments ? "加载中..." : "加载更多评论"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 发表留言 */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            写下你的留言
          </CardTitle>
          <CardDescription>
            分享你的想法、建议或者只是打个招呼
          </CardDescription>
        </CardHeader>
        <CardContent>
          {session ? (
            <div className="flex gap-3">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={session.user?.image || undefined} />
                <AvatarFallback>
                  {session.user?.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-3">
                <Textarea
                  placeholder="说点什么吧..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="min-h-[100px] resize-none"
                  maxLength={2000}
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {newMessage.length}/2000
                  </span>
                  <div className="flex gap-2">
                    {newMessage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setNewMessage("")}
                      >
                        取消
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={handleSubmit}
                      disabled={!newMessage.trim() || isSubmitting}
                    >
                      <Send className="h-4 w-4 mr-1.5" />
                      {isSubmitting ? "发表中..." : "发表留言"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-6 text-center">
              <p className="text-muted-foreground mb-3">登录后即可发表留言</p>
              <Button asChild>
                <Link href="/login">登录</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              {messageCount !== undefined ? `${messageCount} 条留言` : "全部留言"}
            </CardTitle>
            {isMounted ? (
              <Select value={sort} onValueChange={(v) => setSort(v as SortType)}>
                <SelectTrigger className="w-28 h-8">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">最新</SelectItem>
                  <SelectItem value="oldest">最早</SelectItem>
                  <SelectItem value="popular">最热</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Skeleton className="h-8 w-28" />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              ))
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>暂无留言</p>
                <p className="text-sm mt-1">成为第一个留言的人吧</p>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <GuestbookItem
                    key={message.id}
                    message={message as Parameters<typeof GuestbookItem>[0]["message"]}
                  />
                ))}
                {hasNextPage && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                    >
                      {isFetchingNextPage ? "加载中..." : "加载更多"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
