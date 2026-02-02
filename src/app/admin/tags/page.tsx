"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Tag,
  Search,
  Edit2,
  Trash2,
  Loader2,
  Video,
  Plus,
  Merge,
  CheckSquare,
  Square,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TagItem {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  _count: { videos: number };
}

export default function AdminTagsPage() {
  const [search, setSearch] = useState("");
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<"delete" | "merge" | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const utils = trpc.useUtils();

  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();
  const { data: stats } = trpc.admin.getTagStats.useQuery(undefined, {
    enabled: permissions?.scopes.includes("tag:manage"),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.admin.listTags.useInfiniteQuery(
      { limit: 50, search: search || undefined },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        enabled: permissions?.scopes.includes("tag:manage"),
      }
    );

  const createMutation = trpc.admin.createTag.useMutation({
    onSuccess: () => {
      toast.success("标签已创建");
      utils.admin.listTags.invalidate();
      utils.admin.getTagStats.invalidate();
      setIsCreating(false);
      setNewName("");
      setNewSlug("");
    },
    onError: (error) => toast.error(error.message || "创建失败"),
  });

  const updateMutation = trpc.admin.updateTag.useMutation({
    onSuccess: () => {
      toast.success("标签已更新");
      utils.admin.listTags.invalidate();
      setEditingTag(null);
    },
    onError: (error) => toast.error(error.message || "更新失败"),
  });

  const deleteMutation = trpc.admin.deleteTag.useMutation({
    onSuccess: () => {
      toast.success("标签已删除");
      utils.admin.listTags.invalidate();
      utils.admin.getTagStats.invalidate();
      setDeletingId(null);
    },
    onError: (error) => toast.error(error.message || "删除失败"),
  });

  const batchDeleteMutation = trpc.admin.batchDeleteTags.useMutation({
    onSuccess: (result) => {
      toast.success(`已删除 ${result.count} 个标签`);
      utils.admin.listTags.invalidate();
      utils.admin.getTagStats.invalidate();
      setSelectedIds(new Set());
      setBatchAction(null);
    },
    onError: (error) => toast.error(error.message || "批量删除失败"),
  });

  const mergeMutation = trpc.admin.mergeTags.useMutation({
    onSuccess: (result) => {
      toast.success(`已将 ${result.mergedCount} 个标签合并到目标标签`);
      utils.admin.listTags.invalidate();
      utils.admin.getTagStats.invalidate();
      setSelectedIds(new Set());
      setBatchAction(null);
      setMergeTargetId("");
    },
    onError: (error) => toast.error(error.message || "合并失败"),
  });

  const tags = useMemo(
    () => data?.pages.flatMap((page) => page.tags) || [],
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
    if (selectedIds.size === tags.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tags.map((t) => t.id)));
    }
  }, [tags, selectedIds.size]);

  const handleEdit = (tag: TagItem) => {
    setEditingTag(tag);
    setEditName(tag.name);
    setEditSlug(tag.slug);
  };

  const handleSave = async () => {
    if (!editingTag) return;
    setIsUpdating(true);
    try {
      await updateMutation.mutateAsync({
        tagId: editingTag.id,
        name: editName,
        slug: editSlug,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("请输入标签名称");
      return;
    }
    await createMutation.mutateAsync({
      name: newName.trim(),
      slug: newSlug.trim() || undefined,
    });
  };

  const handleMerge = () => {
    if (!mergeTargetId) {
      toast.error("请选择目标标签");
      return;
    }
    const sourceIds = Array.from(selectedIds).filter((id) => id !== mergeTargetId);
    if (sourceIds.length === 0) {
      toast.error("请选择要合并的标签");
      return;
    }
    mergeMutation.mutate({
      sourceTagIds: sourceIds,
      targetTagId: mergeTargetId,
    });
  };

  if (!permissions?.scopes.includes("tag:manage")) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        您没有标签管理权限
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题和统计 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          <h1 className="text-xl font-semibold">标签管理</h1>
        </div>

        <div className="flex items-center gap-4">
          {stats && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">总计</span>
                <Badge variant="outline">{stats.total}</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">有视频</span>
                <Badge variant="secondary">{stats.withVideos}</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">空标签</span>
                <Badge variant="outline">{stats.empty}</Badge>
              </div>
            </div>
          )}
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />
            创建标签
          </Button>
        </div>
      </div>

      {/* 搜索 */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索标签名称或 slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* 批量操作栏 */}
      {tags.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSelectAll}
            className="gap-1"
          >
            {selectedIds.size === tags.length && tags.length > 0 ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {selectedIds.size === tags.length && tags.length > 0 ? "取消全选" : "全选"}
          </Button>

          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                已选 {selectedIds.size} 个
              </span>
              <div className="flex items-center gap-2 ml-auto">
                {selectedIds.size >= 2 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBatchAction("merge")}
                  >
                    <Merge className="h-4 w-4 mr-1" />
                    合并标签
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBatchAction("delete")}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  批量删除
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 标签列表 */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            没有找到标签
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tags.map((tag) => {
              const isSelected = selectedIds.has(tag.id);

              return (
                <Card
                  key={tag.id}
                  className={cn(
                    "transition-colors hover:bg-muted/50",
                    isSelected && "ring-2 ring-primary"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(tag.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              href={`/tag/${tag.slug}`}
                              className="font-medium hover:underline block truncate"
                            >
                              {tag.name}
                            </Link>
                            <div className="text-sm text-muted-foreground mt-0.5">
                              /{tag.slug}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              asChild
                            >
                              <Link href={`/tag/${tag.slug}`} target="_blank">
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEdit(tag)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setDeletingId(tag.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                          <span className="flex items-center gap-1">
                            <Video className="h-3 w-3" />
                            {tag._count.videos} 个视频
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(tag.createdAt).toLocaleDateString("zh-CN")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

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
        </>
      )}

      {/* 创建标签对话框 */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建标签</DialogTitle>
            <DialogDescription>创建一个新的视频标签</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">标签名称 *</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例如：动画"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">URL 标识 (slug)</label>
              <Input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="例如：animation（留空自动生成）"
              />
              <p className="text-xs text-muted-foreground">
                用于 URL 中的标识，建议使用小写字母和连字符
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreating(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={!!editingTag} onOpenChange={() => setEditingTag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑标签</DialogTitle>
            <DialogDescription>修改标签的名称和 URL 标识</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">标签名称</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="标签名称"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">URL 标识 (slug)</label>
              <Input
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value)}
                placeholder="url-slug"
              />
              <p className="text-xs text-muted-foreground">
                用于 URL 中的标识，建议使用小写字母和连字符
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTag(null)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={isUpdating}>
              {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要删除这个标签吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销，标签将被永久删除。已关联的视频不会被删除，但会失去此标签。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteMutation.mutate({ tagId: deletingId })}
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
            <AlertDialogDescription>
              将永久删除 {selectedIds.size} 个标签，已关联的视频不会被删除，但会失去这些标签。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => batchDeleteMutation.mutate({ tagIds: Array.from(selectedIds) })}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 合并标签对话框 */}
      <Dialog open={batchAction === "merge"} onOpenChange={() => setBatchAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>合并标签</DialogTitle>
            <DialogDescription>
              将所选标签合并到目标标签。合并后，原标签将被删除，关联的视频会转移到目标标签。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">选择目标标签</label>
            <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="选择保留的目标标签" />
              </SelectTrigger>
              <SelectContent>
                {tags
                  .filter((t) => selectedIds.has(t.id))
                  .map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name} ({tag._count.videos} 个视频)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              将合并 {selectedIds.size - (mergeTargetId ? 1 : 0)} 个标签到目标标签
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchAction(null)}>
              取消
            </Button>
            <Button onClick={handleMerge} disabled={mergeMutation.isPending || !mergeTargetId}>
              {mergeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认合并
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
