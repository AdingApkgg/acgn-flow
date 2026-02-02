"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ThumbsUp,
  ThumbsDown,
  MoreVertical,
  Edit,
  Trash2,
  Pin,
  ChevronDown,
  ChevronUp,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/format";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { parseDeviceInfo, getHighEntropyDeviceInfo, mergeDeviceInfo, type DeviceInfo } from "@/lib/device-info";
import { getGpsLocation, formatGpsLocation } from "@/lib/geolocation";

interface GuestbookMessage {
  id: string;
  content: string;
  createdAt: Date;
  isEdited: boolean;
  isPinned: boolean;
  likes: number;
  dislikes: number;
  userReaction: boolean | null;
  ipv4Location?: string | null;
  ipv6Location?: string | null;
  gpsLocation?: string | null;
  deviceInfo?: {
    deviceType?: string | null;
    os?: string | null;
    osVersion?: string | null;
    browser?: string | null;
    browserVersion?: string | null;
    brand?: string | null;
  } | null;
  user: {
    id: string;
    username: string;
    nickname: string | null;
    avatar: string | null;
  };
  replyToUser?: {
    id: string;
    username: string;
    nickname: string | null;
  } | null;
  _count: {
    replies: number;
  };
}

interface GuestbookItemProps {
  message: GuestbookMessage;
  isReply?: boolean;
}

export function GuestbookItem({ message, isReply = false }: GuestbookItemProps) {
  const { data: session } = useSession();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [showReplies, setShowReplies] = useState(false);
  const [localLikes, setLocalLikes] = useState(message.likes);
  const [localDislikes, setLocalDislikes] = useState(message.dislikes);
  const [localReaction, setLocalReaction] = useState(message.userReaction);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [gpsLocation, setGpsLocation] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const isOwner = session?.user?.id === message.user.id;
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "OWNER";

  // 获取回复列表
  const {
    data: repliesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.guestbook.getReplies.useInfiniteQuery(
    { messageId: message.id, limit: 10 },
    {
      enabled: showReplies && !isReply,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const replies = repliesData?.pages.flatMap((page) => page.replies) ?? [];

  // 编辑
  const updateMutation = trpc.guestbook.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      utils.guestbook.list.invalidate();
      toast.success("留言已更新");
    },
    onError: (error) => {
      toast.error(error.message || "更新失败");
    },
  });

  // 删除
  const deleteMutation = trpc.guestbook.delete.useMutation({
    onSuccess: () => {
      utils.guestbook.list.invalidate();
      utils.guestbook.getCount.invalidate();
      toast.success("留言已删除");
    },
    onError: (error) => {
      toast.error(error.message || "删除失败");
    },
  });

  // 回复
  const replyMutation = trpc.guestbook.create.useMutation({
    onSuccess: () => {
      setReplyContent("");
      setIsReplying(false);
      setShowReplies(true);
      utils.guestbook.getReplies.invalidate({ messageId: message.id });
      utils.guestbook.list.invalidate();
      toast.success("回复成功");
    },
    onError: (error) => {
      toast.error(error.message || "回复失败");
    },
  });

  // 点赞/踩
  const reactMutation = trpc.guestbook.react.useMutation({
    onSuccess: (data) => {
      setLocalLikes(data.likes);
      setLocalDislikes(data.dislikes);
      setLocalReaction(data.userReaction);
    },
    onError: (error) => {
      toast.error(error.message || "操作失败");
    },
  });

  // 置顶
  const pinMutation = trpc.guestbook.pin.useMutation({
    onSuccess: () => {
      utils.guestbook.list.invalidate();
      toast.success(message.isPinned ? "已取消置顶" : "已置顶");
    },
    onError: (error) => {
      toast.error(error.message || "操作失败");
    },
  });

  const handleReact = useCallback(
    (isLike: boolean) => {
      if (!session) {
        toast.error("请先登录");
        return;
      }
      const newReaction = localReaction === isLike ? null : isLike;
      reactMutation.mutate({ messageId: message.id, isLike: newReaction });
    },
    [session, localReaction, reactMutation, message.id]
  );

  const handleSubmitReply = useCallback(async () => {
    if (!replyContent.trim()) return;
    
    let currentDeviceInfo = deviceInfo;
    if (!currentDeviceInfo) {
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

    replyMutation.mutate({
      content: replyContent.trim(),
      parentId: isReply ? undefined : message.id,
      replyToUserId: message.user.id,
      gpsLocation: currentGps || undefined,
      deviceInfo: currentDeviceInfo || undefined,
    });
  }, [replyContent, replyMutation, message.id, message.user.id, isReply, deviceInfo, gpsLocation]);

  const displayName = message.user.nickname || message.user.username;
  const replyToDisplayName = message.replyToUser?.nickname || message.replyToUser?.username;

  // 格式化位置信息
  const formatLocation = (location: string | null | undefined) => {
    if (!location) return null;
    // 简化显示：只取主要地区信息
    const parts = location.split(" ").filter(Boolean);
    if (parts.length > 3) {
      return parts.slice(0, 3).join(" ");
    }
    return location;
  };

  const ipLocation = formatLocation(message.ipv4Location) || formatLocation(message.ipv6Location);

  return (
    <div className={cn("flex gap-3", isReply && "ml-12 mt-3")}>
      <Link href={`/user/${message.user.id}`}>
        <Avatar className={cn("shrink-0", isReply ? "h-8 w-8" : "h-10 w-10")}>
          <AvatarImage src={message.user.avatar || undefined} />
          <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        {/* 用户名和元信息 */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/user/${message.user.id}`}
            className="font-medium text-sm hover:text-primary"
          >
            {displayName}
          </Link>
          {message.isPinned && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              置顶
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(message.createdAt)}
          </span>
          {message.isEdited && (
            <span className="text-xs text-muted-foreground">(已编辑)</span>
          )}
        </div>

        {/* 位置信息 */}
        {ipLocation && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Globe className="h-3 w-3" />
            <span>{ipLocation}</span>
          </div>
        )}

        {/* 评论内容 */}
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[60px] resize-none"
              maxLength={2000}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => updateMutation.mutate({ id: message.id, content: editContent })}
                disabled={!editContent.trim() || updateMutation.isPending}
              >
                保存
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                取消
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm mt-1 whitespace-pre-wrap break-words">
            {message.replyToUser && (
              <Link
                href={`/user/${message.replyToUser.id}`}
                className="text-primary hover:underline mr-1"
              >
                @{replyToDisplayName}
              </Link>
            )}
            {message.content}
          </p>
        )}

        {/* 操作按钮 */}
        {!isEditing && (
          <div className="flex items-center gap-1 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 text-xs gap-1",
                localReaction === true && "text-primary"
              )}
              onClick={() => handleReact(true)}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              {localLikes > 0 && <span>{localLikes}</span>}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 text-xs gap-1",
                localReaction === false && "text-destructive"
              )}
              onClick={() => handleReact(false)}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
              {localDislikes > 0 && <span>{localDislikes}</span>}
            </Button>
            {session && !isReply && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setIsReplying(!isReplying)}
              >
                回复
              </Button>
            )}

            {/* 更多操作 */}
            {(isOwner || isAdmin) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {isOwner && (
                    <DropdownMenuItem onClick={() => setIsEditing(true)}>
                      <Edit className="h-4 w-4 mr-2" />
                      编辑
                    </DropdownMenuItem>
                  )}
                  {isAdmin && !isReply && (
                    <DropdownMenuItem
                      onClick={() =>
                        pinMutation.mutate({
                          messageId: message.id,
                          isPinned: !message.isPinned,
                        })
                      }
                    >
                      <Pin className="h-4 w-4 mr-2" />
                      {message.isPinned ? "取消置顶" : "置顶"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      if (confirm("确定删除这条留言吗？")) {
                        deleteMutation.mutate({ id: message.id });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        {/* 回复输入框 */}
        {isReplying && (
          <div className="mt-3 space-y-2">
            <Textarea
              placeholder={`回复 @${displayName}...`}
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              className="min-h-[60px] resize-none"
              maxLength={2000}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSubmitReply}
                disabled={!replyContent.trim() || replyMutation.isPending}
              >
                {replyMutation.isPending ? "发送中..." : "回复"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsReplying(false)}>
                取消
              </Button>
            </div>
          </div>
        )}

        {/* 查看回复 */}
        {!isReply && message._count.replies > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 px-2 text-xs text-primary"
            onClick={() => setShowReplies(!showReplies)}
          >
            {showReplies ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 mr-1" />
                收起回复
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                查看 {message._count.replies} 条回复
              </>
            )}
          </Button>
        )}

        {/* 回复列表 */}
        {showReplies && replies.length > 0 && (
          <div className="mt-2 space-y-3">
            {replies.map((reply) => (
              <GuestbookItem
                key={reply.id}
                message={reply as unknown as GuestbookMessage}
                isReply
              />
            ))}
            {hasNextPage && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-primary"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "加载中..." : "加载更多回复"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
