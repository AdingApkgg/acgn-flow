"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Trash2,
  EyeOff,
  Eye,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Globe,
  Globe2,
  MapPin,
  Smartphone,
  Monitor,
  Tablet,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  CheckSquare,
  Square,
  XCircle,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StatusFilter = "ALL" | "VISIBLE" | "HIDDEN" | "DELETED";

export default function AdminCommentsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const utils = trpc.useUtils();

  // 评论列表
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.admin.listComments.useInfiniteQuery(
    { limit: 20, search: search || undefined, status },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  // 评论统计
  const { data: stats } = trpc.admin.getCommentStats.useQuery();

  const comments = useMemo(
    () => data?.pages.flatMap((page) => page.comments) ?? [],
    [data?.pages]
  );

  // 隐藏/显示
  const toggleHiddenMutation = trpc.admin.toggleCommentHidden.useMutation({
    onSuccess: () => {
      utils.admin.listComments.invalidate();
      utils.admin.getCommentStats.invalidate();
      toast.success("操作成功");
    },
    onError: (error) => toast.error(error.message || "操作失败"),
  });

  // 删除
  const deleteMutation = trpc.admin.deleteComment.useMutation({
    onSuccess: () => {
      utils.admin.listComments.invalidate();
      utils.admin.getCommentStats.invalidate();
      setSelectedIds(new Set());
      toast.success("评论已删除");
    },
    onError: (error) => toast.error(error.message || "删除失败"),
  });

  // 恢复
  const restoreMutation = trpc.admin.restoreComment.useMutation({
    onSuccess: () => {
      utils.admin.listComments.invalidate();
      utils.admin.getCommentStats.invalidate();
      toast.success("评论已恢复");
    },
    onError: (error) => toast.error(error.message || "恢复失败"),
  });

  // 批量操作
  const batchMutation = trpc.admin.batchCommentAction.useMutation({
    onSuccess: (result) => {
      utils.admin.listComments.invalidate();
      utils.admin.getCommentStats.invalidate();
      setSelectedIds(new Set());
      toast.success(`已处理 ${result.count} 条评论`);
    },
    onError: (error) => toast.error(error.message || "批量操作失败"),
  });

  // 硬删除
  const hardDeleteMutation = trpc.admin.hardDeleteComment.useMutation({
    onSuccess: () => {
      utils.admin.listComments.invalidate();
      utils.admin.getCommentStats.invalidate();
      toast.success("评论已彻底删除");
    },
    onError: (error) => toast.error(error.message || "删除失败"),
  });

  // 批量硬删除
  const batchHardDeleteMutation = trpc.admin.batchHardDeleteComments.useMutation({
    onSuccess: (result) => {
      utils.admin.listComments.invalidate();
      utils.admin.getCommentStats.invalidate();
      setSelectedIds(new Set());
      toast.success(`已彻底删除 ${result.count} 条评论`);
    },
    onError: (error) => toast.error(error.message || "批量删除失败"),
  });

  // 选择/取消选择
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

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === comments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(comments.map((c) => c.id)));
    }
  }, [comments, selectedIds.size]);

  // 展开/收起详情
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

  // 批量操作处理
  const handleBatchAction = useCallback(
    (action: "hide" | "show" | "delete" | "restore") => {
      if (selectedIds.size === 0) return;
      batchMutation.mutate({
        commentIds: Array.from(selectedIds),
        action,
      });
    },
    [selectedIds, batchMutation]
  );

  // 设备图标
  const getDeviceIcon = (deviceType?: string | null) => {
    switch (deviceType?.toLowerCase()) {
      case "mobile":
        return Smartphone;
      case "tablet":
        return Tablet;
      default:
        return Monitor;
    }
  };

  return (
    <div className="space-y-6">
      {/* 标题和统计 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <h1 className="text-xl font-semibold">评论管理</h1>
        </div>

        {stats && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">总计</span>
              <Badge variant="outline">{stats.total}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">可见</span>
              <Badge variant="secondary">{stats.visible}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">隐藏</span>
              <Badge variant="outline">{stats.hidden}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">删除</span>
              <Badge variant="destructive">{stats.deleted}</Badge>
            </div>
          </div>
        )}
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="搜索评论内容 / 用户 / 视频标题"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-md"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部</SelectItem>
            <SelectItem value="VISIBLE">可见</SelectItem>
            <SelectItem value="HIDDEN">已隐藏</SelectItem>
            <SelectItem value="DELETED">已删除</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 批量操作栏 */}
      {comments.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSelectAll}
            className="gap-1"
          >
            {selectedIds.size === comments.length ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {selectedIds.size === comments.length ? "取消全选" : "全选"}
          </Button>

          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                已选 {selectedIds.size} 条
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBatchAction("hide")}
                  disabled={batchMutation.isPending}
                >
                  <EyeOff className="h-4 w-4 mr-1" />
                  批量隐藏
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBatchAction("show")}
                  disabled={batchMutation.isPending}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  批量显示
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      disabled={batchMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      批量删除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确定批量删除吗？</AlertDialogTitle>
                      <AlertDialogDescription>
                        将删除 {selectedIds.size} 条评论，此操作可通过「已删除」筛选后恢复。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleBatchAction("delete")}>
                        确定删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBatchAction("restore")}
                  disabled={batchMutation.isPending}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  批量恢复
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={batchHardDeleteMutation.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      彻底删除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确定彻底删除吗？</AlertDialogTitle>
                      <AlertDialogDescription className="text-destructive">
                        将永久删除 {selectedIds.size} 条评论及其所有回复，此操作不可恢复！
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => batchHardDeleteMutation.mutate({ commentIds: Array.from(selectedIds) })}
                      >
                        永久删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          )}
        </div>
      )}

      {/* 评论列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            暂无评论
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => {
            const deviceInfo = comment.deviceInfo as {
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
            } | null;

            const isSelected = selectedIds.has(comment.id);
            const isExpanded = expandedIds.has(comment.id);
            const DeviceIcon = getDeviceIcon(deviceInfo?.deviceType);

            return (
              <Card
                key={comment.id}
                className={cn(
                  "transition-colors",
                  isSelected && "ring-2 ring-primary",
                  comment.isDeleted && "opacity-60"
                )}
              >
                <CardContent className="p-4">
                  {/* 头部：选择框、用户信息、状态、操作按钮 */}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(comment.id)}
                      className="mt-1"
                    />

                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={comment.user.avatar || undefined} />
                      <AvatarFallback>
                        {(comment.user.nickname || comment.user.username).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      {/* 用户名和时间 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/user/${comment.user.id}`}
                          className="font-medium hover:underline"
                        >
                          {comment.user.nickname || comment.user.username}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(comment.createdAt)}
                        </span>
                        {comment.isDeleted && (
                          <Badge variant="destructive" className="text-xs">已删除</Badge>
                        )}
                        {comment.isHidden && !comment.isDeleted && (
                          <Badge variant="secondary" className="text-xs">已隐藏</Badge>
                        )}
                        {comment.isPinned && (
                          <Badge className="text-xs">已置顶</Badge>
                        )}
                      </div>

                      {/* 评论内容 */}
                      <p className="mt-1 text-sm whitespace-pre-wrap break-words">
                        {comment.content}
                      </p>

                      {/* 视频链接和互动数据 */}
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <Link
                          href={`/video/${comment.video.id}`}
                          className="hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {comment.video.title}
                        </Link>
                        <span className="flex items-center gap-1">
                          <ThumbsUp className="h-3 w-3" />
                          {comment.likes}
                        </span>
                        <span className="flex items-center gap-1">
                          <ThumbsDown className="h-3 w-3" />
                          {comment.dislikes}
                        </span>
                      </div>

                      {/* 位置信息标签 */}
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {comment.ipv4Location && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                            <Globe className="h-3 w-3 text-blue-500" />
                            {comment.ipv4Location}
                          </span>
                        )}
                        {comment.ipv6Location && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                            <Globe2 className="h-3 w-3 text-purple-500" />
                            {comment.ipv6Location}
                          </span>
                        )}
                        {comment.gpsLocation && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                            <MapPin className="h-3 w-3 text-green-500" />
                            {comment.gpsLocation}
                          </span>
                        )}
                        {deviceInfo && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                            <DeviceIcon className="h-3 w-3" />
                            {[deviceInfo.os, deviceInfo.osVersion].filter(Boolean).join(" ")}
                            {deviceInfo.browser && ` · ${deviceInfo.browser}`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          toggleHiddenMutation.mutate({
                            commentId: comment.id,
                            isHidden: !comment.isHidden,
                          })
                        }
                        title={comment.isHidden ? "显示" : "隐藏"}
                      >
                        {comment.isHidden ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </Button>

                      {comment.isDeleted ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => restoreMutation.mutate({ commentId: comment.id })}
                            title="恢复"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                title="彻底删除"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>确定彻底删除吗？</AlertDialogTitle>
                                <AlertDialogDescription className="text-destructive">
                                  将永久删除此评论及其所有回复，此操作不可恢复！
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => hardDeleteMutation.mutate({ commentId: comment.id })}
                                >
                                  永久删除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              title="删除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>确定删除这条评论吗？</AlertDialogTitle>
                              <AlertDialogDescription>
                                删除后可通过「已删除」筛选找到并恢复。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate({ commentId: comment.id })}
                              >
                                删除
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleExpand(comment.id)}
                        title="详情"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* 展开的详细信息 */}
                  <Collapsible open={isExpanded}>
                    <CollapsibleContent>
                      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-2">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <div className="font-medium text-foreground mb-1">评论 ID</div>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">{comment.id}</code>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">IPv4 地址</div>
                            {comment.ipv4Address || "-"}
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">IPv6 地址</div>
                            <span className="break-all">{comment.ipv6Address || "-"}</span>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">创建时间</div>
                            {new Date(comment.createdAt).toLocaleString("zh-CN")}
                          </div>
                        </div>

                        {deviceInfo && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                            <div>
                              <div className="font-medium text-foreground mb-1">设备类型</div>
                              {deviceInfo.deviceType || "-"}
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">操作系统</div>
                              {[deviceInfo.os, deviceInfo.osVersion].filter(Boolean).join(" ") || "-"}
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">浏览器</div>
                              {[deviceInfo.browser, deviceInfo.browserVersion].filter(Boolean).join(" ") || "-"}
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">设备</div>
                              {[deviceInfo.brand, deviceInfo.model].filter(Boolean).join(" ") || "-"}
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">屏幕</div>
                              {deviceInfo.screen || "-"} {deviceInfo.pixelRatio && `@${deviceInfo.pixelRatio}x`}
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">语言</div>
                              {deviceInfo.language || "-"}
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">时区</div>
                              {deviceInfo.timezone || "-"}
                            </div>
                            <div>
                              <div className="font-medium text-foreground mb-1">平台</div>
                              {deviceInfo.platform || "-"}
                            </div>
                          </div>
                        )}

                        {comment.userAgent && (
                          <div className="mt-3">
                            <div className="font-medium text-foreground mb-1">User-Agent</div>
                            <code className="text-xs bg-muted px-2 py-1 rounded block break-all">
                              {comment.userAgent}
                            </code>
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
                {isFetchingNextPage ? "加载中..." : "加载更多"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
