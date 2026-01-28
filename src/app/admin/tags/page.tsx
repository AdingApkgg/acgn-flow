"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import Link from "next/link";
import { Tag, Search, Edit2, Trash2, Loader2, Video } from "lucide-react";

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

  const utils = trpc.useUtils();

  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.admin.listTags.useInfiniteQuery(
      { limit: 50, search: search || undefined },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        enabled: permissions?.scopes.includes("tag:manage"),
      }
    );

  const updateMutation = trpc.admin.updateTag.useMutation({
    onSuccess: () => {
      toast.success("标签已更新");
      utils.admin.listTags.invalidate();
      setEditingTag(null);
    },
    onError: (error) => {
      toast.error("更新失败", { description: error.message });
    },
  });

  const deleteMutation = trpc.admin.deleteTag.useMutation({
    onSuccess: () => {
      toast.success("标签已删除");
      utils.admin.listTags.invalidate();
      setDeletingId(null);
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
    },
  });

  const tags = data?.pages.flatMap((page) => page.tags) || [];

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

  if (!permissions?.scopes.includes("tag:manage")) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        您没有标签管理权限
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Tag className="h-6 w-6" />
          标签管理
        </h1>
        <p className="text-muted-foreground mt-1">
          管理网站的视频标签
        </p>
      </div>

      {/* 搜索 */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索标签名称或 slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* 标签列表 */}
      <Card>
        <CardHeader>
          <CardTitle>标签列表</CardTitle>
          <CardDescription>
            共 {tags.length} 个标签{hasNextPage && "（加载更多...）"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array(9)
                .fill(0)
                .map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
            </div>
          ) : tags.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              没有找到标签
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <Link
                          href={`/tag/${tag.slug}`}
                          className="font-medium hover:underline"
                        >
                          {tag.name}
                        </Link>
                        <div className="text-sm text-muted-foreground mt-1">
                          /{tag.slug}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                          <Video className="h-3 w-3" />
                          {tag._count.videos} 个视频
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(tag)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeletingId(tag.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {hasNextPage && (
                <div className="text-center pt-6">
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
        </CardContent>
      </Card>

      {/* 编辑对话框 */}
      <Dialog open={!!editingTag} onOpenChange={() => setEditingTag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑标签</DialogTitle>
            <DialogDescription>
              修改标签的名称和 URL 标识
            </DialogDescription>
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
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
