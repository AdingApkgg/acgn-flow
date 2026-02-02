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
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  MoreVertical,
  Edit,
  Trash2,
  Pin,
  ChevronDown,
  ChevronUp,
  MapPin,
  Globe,
  Globe2,
  Smartphone,
  Monitor,
  Tablet,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRelativeTime } from "@/lib/format";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface CommentUser {
  id: string;
  username: string;
  nickname: string | null;
  avatar?: string | null;
}

interface ReplyToUser {
  id: string;
  username: string;
  nickname: string | null;
}

interface CommentData {
  id: string;
  content: string;
  userId: string;
  likes: number;
  dislikes: number;
  isEdited: boolean;
  isPinned: boolean;
  createdAt: Date;
  user: CommentUser;
  replyToUser?: ReplyToUser | null;
  userReaction: boolean | null;
  _count?: { replies: number };
  ipv4Location?: string | null;
  ipv6Location?: string | null;
  gpsLocation?: string | null;
  deviceInfo?: unknown;
}

interface CommentItemProps {
  comment: CommentData;
  videoId: string;
  parentId?: string; // 顶级评论 ID（用于回复的回复）
  isReply?: boolean;
  onReplyToComment?: (user: CommentUser) => void; // 回调：回复此评论
}

export function CommentItem({ 
  comment, 
  videoId, 
  parentId,
  isReply = false,
  onReplyToComment,
}: CommentItemProps) {
  const { data: session } = useSession();
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [editContent, setEditContent] = useState(comment.content);
  const [showReplies, setShowReplies] = useState(false);
  const [localLikes, setLocalLikes] = useState(comment.likes);
  const [localDislikes, setLocalDislikes] = useState(comment.dislikes);
  const [localReaction, setLocalReaction] = useState<boolean | null>(comment.userReaction);
  const [replyToUser, setReplyToUser] = useState<CommentUser | null>(null);

  const utils = trpc.useUtils();
  const isOwner = session?.user?.id === comment.userId;
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "OWNER";
  const replyCount = comment._count?.replies ?? 0;
  
  // 实际的顶级评论 ID
  const topLevelParentId = parentId || comment.id;

  // 获取回复
  const {
    data: repliesData,
    fetchNextPage: fetchMoreReplies,
    hasNextPage: hasMoreReplies,
    isFetchingNextPage: isFetchingReplies,
  } = trpc.comment.getReplies.useInfiniteQuery(
    { commentId: comment.id, limit: 10 },
    {
      enabled: showReplies && !isReply,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const replies = repliesData?.pages.flatMap((page) => page.replies) ?? [];

  // 点赞/踩
  const reactMutation = trpc.comment.react.useMutation({
    onMutate: async ({ isLike }) => {
      // 乐观更新
      const prevReaction = localReaction;
      setLocalReaction(isLike);
      
      if (isLike === null) {
        // 取消反应
        if (prevReaction === true) setLocalLikes((l) => l - 1);
        if (prevReaction === false) setLocalDislikes((d) => d - 1);
      } else if (prevReaction === null) {
        // 新反应
        if (isLike) setLocalLikes((l) => l + 1);
        else setLocalDislikes((d) => d + 1);
      } else if (prevReaction !== isLike) {
        // 切换反应
        if (isLike) {
          setLocalLikes((l) => l + 1);
          setLocalDislikes((d) => d - 1);
        } else {
          setLocalLikes((l) => l - 1);
          setLocalDislikes((d) => d + 1);
        }
      }
    },
    onError: () => {
      // 回滚
      setLocalLikes(comment.likes);
      setLocalDislikes(comment.dislikes);
      setLocalReaction(comment.userReaction);
      toast.error("操作失败");
    },
  });

  // 发表回复
  const createReplyMutation = trpc.comment.create.useMutation({
    onSuccess: () => {
      setReplyContent("");
      setIsReplying(false);
      setReplyToUser(null);
      setShowReplies(true);
      utils.comment.getReplies.invalidate({ commentId: topLevelParentId });
      utils.comment.list.invalidate({ videoId });
      toast.success("回复成功");
    },
    onError: (error) => {
      toast.error(error.message || "回复失败");
    },
  });

  // 编辑评论
  const updateMutation = trpc.comment.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      utils.comment.list.invalidate({ videoId });
      utils.comment.getReplies.invalidate();
      toast.success("编辑成功");
    },
    onError: (error) => {
      toast.error(error.message || "编辑失败");
    },
  });

  // 删除评论
  const deleteMutation = trpc.comment.delete.useMutation({
    onSuccess: () => {
      utils.comment.list.invalidate({ videoId });
      utils.comment.getReplies.invalidate();
      utils.comment.getCount.invalidate({ videoId });
      toast.success("删除成功");
    },
    onError: (error) => {
      toast.error(error.message || "删除失败");
    },
  });

  // 置顶评论
  const pinMutation = trpc.comment.pin.useMutation({
    onSuccess: () => {
      utils.comment.list.invalidate({ videoId });
      toast.success(comment.isPinned ? "已取消置顶" : "已置顶");
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
      reactMutation.mutate({ commentId: comment.id, isLike: newReaction });
    },
    [session, localReaction, reactMutation, comment.id]
  );

  const handleReply = useCallback(() => {
    if (!replyContent.trim()) return;
    // 确定回复目标用户
    const targetUserId = replyToUser?.id || comment.user.id;
    createReplyMutation.mutate({
      videoId,
      content: replyContent.trim(),
      parentId: topLevelParentId,
      replyToUserId: targetUserId,
    });
  }, [replyContent, createReplyMutation, videoId, topLevelParentId, replyToUser, comment.user.id]);

  // 开始回复（顶级评论或回复的回复）
  const startReply = useCallback((targetUser?: CommentUser) => {
    if (!session) {
      toast.error("请先登录");
      return;
    }
    if (isReply && onReplyToComment) {
      // 如果是回复，通知父组件处理
      onReplyToComment(comment.user);
    } else {
      // 顶级评论，在当前组件处理
      setReplyToUser(targetUser || null);
      setIsReplying(true);
    }
  }, [session, isReply, onReplyToComment, comment.user]);

  const handleEdit = useCallback(() => {
    if (!editContent.trim()) return;
    updateMutation.mutate({ id: comment.id, content: editContent.trim() });
  }, [editContent, updateMutation, comment.id]);

  const displayName = comment.user.nickname || comment.user.username;
  const normalizedDeviceInfo = (() => {
    if (!comment.deviceInfo || typeof comment.deviceInfo !== "object") return null;
    if (Array.isArray(comment.deviceInfo)) return null;
    return comment.deviceInfo as {
      deviceType?: string | null;
      os?: string | null;
      osVersion?: string | null;
      browser?: string | null;
      browserVersion?: string | null;
      brand?: string | null;
      model?: string | null;
      platform?: string | null;
      language?: string | null;
      timezone?: string | null;
      screen?: string | null;
      pixelRatio?: number | null;
    };
  })();
  // 设备图标
  const DeviceIcon = (() => {
    if (!normalizedDeviceInfo?.deviceType) return Monitor;
    switch (normalizedDeviceInfo.deviceType.toLowerCase()) {
      case "mobile": return Smartphone;
      case "tablet": return Tablet;
      default: return Monitor;
    }
  })();

  // 设备简要信息（用于显示）
  const deviceBrief = (() => {
    if (!normalizedDeviceInfo) return null;
    const os = [normalizedDeviceInfo.os, normalizedDeviceInfo.osVersion].filter(Boolean).join(" ");
    const browser = normalizedDeviceInfo.browser || "";
    return [os, browser].filter(Boolean).join(" · ") || null;
  })();

  // 设备完整信息（用于 tooltip）
  const deviceFullDetails = (() => {
    if (!normalizedDeviceInfo) return null;
    const lines = [
      normalizedDeviceInfo.deviceType && `类型: ${normalizedDeviceInfo.deviceType}`,
      normalizedDeviceInfo.os && `系统: ${[normalizedDeviceInfo.os, normalizedDeviceInfo.osVersion].filter(Boolean).join(" ")}`,
      normalizedDeviceInfo.browser && `浏览器: ${[normalizedDeviceInfo.browser, normalizedDeviceInfo.browserVersion].filter(Boolean).join(" ")}`,
      (normalizedDeviceInfo.brand || normalizedDeviceInfo.model) && `设备: ${[normalizedDeviceInfo.brand, normalizedDeviceInfo.model].filter(Boolean).join(" ")}`,
      normalizedDeviceInfo.screen && `屏幕: ${normalizedDeviceInfo.screen}`,
      normalizedDeviceInfo.language && `语言: ${normalizedDeviceInfo.language}`,
      normalizedDeviceInfo.timezone && `时区: ${normalizedDeviceInfo.timezone}`,
    ].filter(Boolean);
    return lines.length > 0 ? lines.join("\n") : null;
  })();

  // 是否有元信息需要显示
  const hasMetaInfo = comment.ipv4Location || comment.ipv6Location || comment.gpsLocation || deviceBrief;

  return (
    <div className={cn("flex gap-3", isReply && "ml-12")}>
      <Link href={`/user/${comment.user.id}`}>
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarImage src={comment.user.avatar || undefined} />
          <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        {/* 用户信息和时间 */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/user/${comment.user.id}`}
            className="font-medium text-sm hover:underline"
          >
            {displayName}
          </Link>
          {comment.isPinned && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
              置顶
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(comment.createdAt)}
          </span>
          {comment.isEdited && (
            <span className="text-xs text-muted-foreground italic">(已编辑)</span>
          )}
        </div>

        {/* 位置和设备信息 - 单独一行，更紧凑的标签样式 */}
        {hasMetaInfo && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {/* IPv4 属地 */}
            {comment.ipv4Location && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded cursor-default">
                    <Globe className="h-3 w-3 text-blue-500" />
                    <span className="max-w-[100px] truncate">{comment.ipv4Location}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p className="font-medium">IPv4 属地</p>
                  <p className="text-muted-foreground">{comment.ipv4Location}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* IPv6 属地 */}
            {comment.ipv6Location && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded cursor-default">
                    <Globe2 className="h-3 w-3 text-purple-500" />
                    <span className="max-w-[100px] truncate">{comment.ipv6Location}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p className="font-medium">IPv6 属地</p>
                  <p className="text-muted-foreground">{comment.ipv6Location}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* GPS 定位 */}
            {comment.gpsLocation && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded cursor-default">
                    <MapPin className="h-3 w-3 text-green-500" />
                    <span className="max-w-[120px] truncate">{comment.gpsLocation}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[300px]">
                  <p className="font-medium">GPS 定位</p>
                  <p className="text-muted-foreground whitespace-pre-wrap">{comment.gpsLocation}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* 设备信息 */}
            {deviceBrief && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded cursor-default">
                    <DeviceIcon className="h-3 w-3" />
                    <span className="max-w-[100px] truncate">{deviceBrief}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <pre className="whitespace-pre-wrap font-sans">{deviceFullDetails}</pre>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* 评论内容 */}
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[80px] resize-none"
              maxLength={2000}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(comment.content);
                }}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleEdit}
                disabled={!editContent.trim() || updateMutation.isPending}
              >
                保存
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm whitespace-pre-wrap break-words">
            {comment.replyToUser && (
              <Link
                href={`/user/${comment.replyToUser.id}`}
                className="text-primary hover:underline mr-1"
              >
                @{comment.replyToUser.nickname || comment.replyToUser.username}
              </Link>
            )}
            {comment.content}
          </p>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center gap-1 mt-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-2",
              localReaction === true && "text-primary"
            )}
            onClick={() => handleReact(true)}
          >
            <ThumbsUp className="h-4 w-4 mr-1" />
            {localLikes > 0 && <span className="text-xs">{localLikes}</span>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-2",
              localReaction === false && "text-destructive"
            )}
            onClick={() => handleReact(false)}
          >
            <ThumbsDown className="h-4 w-4 mr-1" />
            {localDislikes > 0 && (
              <span className="text-xs">{localDislikes}</span>
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => startReply()}
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            回复
          </Button>

          {/* 更多操作 */}
          {(isOwner || isAdmin) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {isOwner && (
                  <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    编辑
                  </DropdownMenuItem>
                )}
                {!isReply && isAdmin && (
                  <DropdownMenuItem
                    onClick={() =>
                      pinMutation.mutate({
                        commentId: comment.id,
                        isPinned: !comment.isPinned,
                      })
                    }
                  >
                    <Pin className="h-4 w-4 mr-2" />
                    {comment.isPinned ? "取消置顶" : "置顶"}
                  </DropdownMenuItem>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={(e) => e.preventDefault()}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      删除
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确定删除这条评论吗？</AlertDialogTitle>
                      <AlertDialogDescription>
                        此操作无法撤销。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate({ id: comment.id })}
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

        {/* 回复输入框 */}
        {isReplying && (
          <div className="mt-3 flex gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={session?.user?.image || undefined} />
              <AvatarFallback>
                {session?.user?.name?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              {/* 显示回复目标 */}
              {replyToUser && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>回复</span>
                  <span className="text-primary">
                    @{replyToUser.nickname || replyToUser.username}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-xs"
                    onClick={() => setReplyToUser(null)}
                  >
                    ×
                  </Button>
                </div>
              )}
              <Textarea
                placeholder={`回复 @${replyToUser ? (replyToUser.nickname || replyToUser.username) : displayName}...`}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="min-h-[60px] resize-none"
                maxLength={2000}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsReplying(false);
                    setReplyContent("");
                    setReplyToUser(null);
                  }}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={!replyContent.trim() || createReplyMutation.isPending}
                >
                  回复
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 回复列表 */}
        {!isReply && replyCount > 0 && (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-primary h-8 px-2"
              onClick={() => setShowReplies(!showReplies)}
            >
              {showReplies ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  收起回复
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  {replyCount} 条回复
                </>
              )}
            </Button>

            {showReplies && (
              <div className="mt-3 space-y-4">
                {replies.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply as CommentData}
                    videoId={videoId}
                    parentId={comment.id}
                    isReply
                    onReplyToComment={(user) => {
                      setReplyToUser(user);
                      setIsReplying(true);
                    }}
                  />
                ))}
                {hasMoreReplies && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary"
                    onClick={() => fetchMoreReplies()}
                    disabled={isFetchingReplies}
                  >
                    {isFetchingReplies ? "加载中..." : "查看更多回复"}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
