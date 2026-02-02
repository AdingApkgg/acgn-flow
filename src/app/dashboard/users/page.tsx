"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Users,
  Search,
  Shield,
  Loader2,
  ChevronDown,
  ChevronUp,
  Ban,
  CheckCircle,
  Video,
  MessageSquare,
  Heart,
  MapPin,
  Globe,
  Calendar,
  Mail,
  ExternalLink,
  CheckSquare,
  Square,
  UserX,
  UserCheck,
} from "lucide-react";
import { ADMIN_SCOPES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type UserRole = "USER" | "ADMIN" | "OWNER";

interface UserItem {
  id: string;
  email: string;
  username: string;
  nickname: string | null;
  avatar: string | null;
  role: UserRole;
  adminScopes: unknown;
  isBanned: boolean;
  banReason: string | null;
  lastIpLocation: string | null;
  lastGpsLocation: string | null;
  createdAt: Date;
  _count: { videos: number; comments: number; likes: number };
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const [bannedFilter, setBannedFilter] = useState<"ALL" | "BANNED" | "ACTIVE">("ALL");
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [editingScopes, setEditingScopes] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [banningUser, setBanningUser] = useState<UserItem | null>(null);
  const [banReason, setBanReason] = useState("");

  const utils = trpc.useUtils();

  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();
  const { data: stats } = trpc.admin.getUserStats.useQuery(undefined, {
    enabled: permissions?.scopes.includes("user:view"),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.admin.listUsers.useInfiniteQuery(
      {
        limit: 20,
        search: search || undefined,
        role: roleFilter,
        banned: bannedFilter,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        enabled: permissions?.scopes.includes("user:view"),
      }
    );

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("用户角色已更新");
      utils.admin.listUsers.invalidate();
      utils.admin.getUserStats.invalidate();
      setSelectedUser(null);
    },
    onError: (error) => toast.error(error.message || "更新失败"),
  });

  const updateScopesMutation = trpc.admin.updateAdminScopes.useMutation({
    onSuccess: () => {
      toast.success("权限已更新");
      utils.admin.listUsers.invalidate();
      setSelectedUser(null);
    },
    onError: (error) => toast.error(error.message || "更新失败"),
  });

  const banUserMutation = trpc.admin.banUser.useMutation({
    onSuccess: () => {
      toast.success("用户已封禁");
      utils.admin.listUsers.invalidate();
      utils.admin.getUserStats.invalidate();
      setBanningUser(null);
      setBanReason("");
    },
    onError: (error) => toast.error(error.message || "封禁失败"),
  });

  const unbanUserMutation = trpc.admin.unbanUser.useMutation({
    onSuccess: () => {
      toast.success("用户已解封");
      utils.admin.listUsers.invalidate();
      utils.admin.getUserStats.invalidate();
    },
    onError: (error) => toast.error(error.message || "解封失败"),
  });

  const batchBanMutation = trpc.admin.batchBanUsers.useMutation({
    onSuccess: (result) => {
      toast.success(`已封禁 ${result.count} 个用户`);
      utils.admin.listUsers.invalidate();
      utils.admin.getUserStats.invalidate();
      setSelectedIds(new Set());
    },
    onError: (error) => toast.error(error.message || "批量封禁失败"),
  });

  const batchUnbanMutation = trpc.admin.batchUnbanUsers.useMutation({
    onSuccess: (result) => {
      toast.success(`已解封 ${result.count} 个用户`);
      utils.admin.listUsers.invalidate();
      utils.admin.getUserStats.invalidate();
      setSelectedIds(new Set());
    },
    onError: (error) => toast.error(error.message || "批量解封失败"),
  });

  const users = useMemo(
    () => data?.pages.flatMap((page) => page.users) || [],
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
    const selectableUsers = users.filter((u) => u.role !== "OWNER");
    if (selectedIds.size === selectableUsers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableUsers.map((u) => u.id)));
    }
  }, [users, selectedIds.size]);

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

  const handleEditUser = (user: UserItem) => {
    setSelectedUser(user);
    setEditingScopes((user.adminScopes as string[]) || []);
  };

  const handleUpdateRole = async (newRole: "USER" | "ADMIN") => {
    if (!selectedUser) return;
    setIsUpdating(true);
    try {
      await updateRoleMutation.mutateAsync({
        userId: selectedUser.id,
        role: newRole,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateScopes = async () => {
    if (!selectedUser) return;
    setIsUpdating(true);
    try {
      await updateScopesMutation.mutateAsync({
        userId: selectedUser.id,
        scopes: editingScopes,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleScope = (scope: string) => {
    setEditingScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case "OWNER":
        return <Badge className="bg-gradient-to-r from-amber-500 to-orange-500">站长</Badge>;
      case "ADMIN":
        return <Badge variant="secondary">管理员</Badge>;
      default:
        return <Badge variant="outline">用户</Badge>;
    }
  };

  if (!permissions?.scopes.includes("user:view")) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        您没有用户管理权限
      </div>
    );
  }

  const selectableUsers = users.filter((u) => u.role !== "OWNER");

  return (
    <div className="space-y-6">
      {/* 标题和统计 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h1 className="text-xl font-semibold">用户管理</h1>
        </div>

        {stats && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">总计</span>
              <Badge variant="outline">{stats.total}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">普通用户</span>
              <Badge variant="secondary">{stats.users}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">管理员</span>
              <Badge variant="secondary">{stats.admins}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">已封禁</span>
              <Badge variant="destructive">{stats.banned}</Badge>
            </div>
          </div>
        )}
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索用户名、昵称或邮箱..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="角色" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部角色</SelectItem>
            <SelectItem value="USER">普通用户</SelectItem>
            <SelectItem value="ADMIN">管理员</SelectItem>
            <SelectItem value="OWNER">站长</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={bannedFilter}
          onValueChange={(v) => setBannedFilter(v as typeof bannedFilter)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部状态</SelectItem>
            <SelectItem value="ACTIVE">正常</SelectItem>
            <SelectItem value="BANNED">已封禁</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 批量操作栏 */}
      {users.length > 0 && permissions?.scopes.includes("user:manage") && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSelectAll}
            className="gap-1"
          >
            {selectedIds.size === selectableUsers.length && selectableUsers.length > 0 ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {selectedIds.size === selectableUsers.length && selectableUsers.length > 0 ? "取消全选" : "全选"}
          </Button>

          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                已选 {selectedIds.size} 个
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => batchBanMutation.mutate({ userIds: Array.from(selectedIds) })}
                  disabled={batchBanMutation.isPending}
                >
                  <UserX className="h-4 w-4 mr-1" />
                  批量封禁
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => batchUnbanMutation.mutate({ userIds: Array.from(selectedIds) })}
                  disabled={batchUnbanMutation.isPending}
                >
                  <UserCheck className="h-4 w-4 mr-1" />
                  批量解封
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 用户列表 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            没有找到用户
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const isSelected = selectedIds.has(user.id);
            const isExpanded = expandedIds.has(user.id);
            const canSelect = user.role !== "OWNER";

            return (
              <Card
                key={user.id}
                className={cn(
                  "transition-colors",
                  isSelected && "ring-2 ring-primary",
                  user.isBanned && "opacity-60"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {canSelect && permissions?.scopes.includes("user:manage") && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(user.id)}
                        className="mt-2"
                      />
                    )}

                    <Avatar className="h-12 w-12 shrink-0">
                      <AvatarImage src={user.avatar || undefined} />
                      <AvatarFallback>
                        {(user.nickname || user.username).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/user/${user.id}`}
                          className="font-medium hover:underline"
                        >
                          {user.nickname || user.username}
                        </Link>
                        {getRoleBadge(user.role)}
                        {user.isBanned && (
                          <Badge variant="destructive" className="text-xs">
                            <Ban className="h-3 w-3 mr-1" />
                            已封禁
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span>@{user.username}</span>
                        <span className="flex items-center gap-1">
                          <Video className="h-3 w-3" />
                          {user._count.videos}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {user._count.comments}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {user._count.likes}
                        </span>
                      </div>

                      {/* 位置信息 */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {user.lastIpLocation && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                            <Globe className="h-3 w-3 text-blue-500" />
                            {user.lastIpLocation}
                          </span>
                        )}
                        {user.lastGpsLocation && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                            <MapPin className="h-3 w-3 text-green-500" />
                            {user.lastGpsLocation}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 shrink-0">
                      {permissions?.scopes.includes("user:manage") && user.role !== "OWNER" && (
                        <>
                          {user.isBanned ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => unbanUserMutation.mutate({ userId: user.id })}
                              title="解封"
                            >
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setBanningUser(user)}
                              title="封禁"
                            >
                              <Ban className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </>
                      )}

                      {permissions?.isOwner && user.role !== "OWNER" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEditUser(user)}
                          title="权限设置"
                        >
                          <Shield className="h-4 w-4" />
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        asChild
                      >
                        <Link href={`/user/${user.id}`} target="_blank" title="查看主页">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleExpand(user.id)}
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
                      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <div className="font-medium text-foreground mb-1">用户 ID</div>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">{user.id}</code>
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1 flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              邮箱
                            </div>
                            {user.email}
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              注册时间
                            </div>
                            {new Date(user.createdAt).toLocaleString("zh-CN")}
                          </div>
                          <div>
                            <div className="font-medium text-foreground mb-1">角色</div>
                            {user.role === "OWNER" ? "站长" : user.role === "ADMIN" ? "管理员" : "普通用户"}
                          </div>
                        </div>

                        {user.isBanned && user.banReason && (
                          <div className="p-2 bg-destructive/10 rounded text-destructive">
                            <div className="font-medium mb-1">封禁原因</div>
                            {user.banReason}
                          </div>
                        )}

                        {user.role === "ADMIN" && (user.adminScopes as string[])?.length > 0 && (
                          <div>
                            <div className="font-medium text-foreground mb-1">管理权限</div>
                            <div className="flex flex-wrap gap-1">
                              {(user.adminScopes as string[]).map((scope) => (
                                <Badge key={scope} variant="outline" className="text-xs">
                                  {ADMIN_SCOPES[scope as keyof typeof ADMIN_SCOPES] || scope}
                                </Badge>
                              ))}
                            </div>
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
                {isFetchingNextPage ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                加载更多
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 编辑用户对话框 */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              管理用户权限
            </DialogTitle>
            <DialogDescription>
              修改 {selectedUser?.nickname || selectedUser?.username} 的角色和权限
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-6 py-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={selectedUser.avatar || undefined} />
                  <AvatarFallback>
                    {(selectedUser.nickname || selectedUser.username).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{selectedUser.nickname || selectedUser.username}</div>
                  <div className="text-sm text-muted-foreground">@{selectedUser.username}</div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">用户角色</label>
                <Select
                  value={selectedUser.role}
                  onValueChange={(v) => handleUpdateRole(v as "USER" | "ADMIN")}
                  disabled={isUpdating}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">普通用户</SelectItem>
                    <SelectItem value="ADMIN">管理员</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedUser.role === "ADMIN" && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">权限范围</label>
                  <div className="space-y-2">
                    {Object.entries(ADMIN_SCOPES).map(([scope, label]) => (
                      <div key={scope} className="flex items-center space-x-2">
                        <Checkbox
                          id={scope}
                          checked={editingScopes.includes(scope)}
                          onCheckedChange={() => toggleScope(scope)}
                          disabled={isUpdating}
                        />
                        <label htmlFor={scope} className="text-sm cursor-pointer">
                          {label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedUser(null)}>
              取消
            </Button>
            {selectedUser?.role === "ADMIN" && (
              <Button onClick={handleUpdateScopes} disabled={isUpdating}>
                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存权限
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 封禁用户对话框 */}
      <AlertDialog open={!!banningUser} onOpenChange={() => setBanningUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>封禁用户</AlertDialogTitle>
            <AlertDialogDescription>
              确定要封禁 {banningUser?.nickname || banningUser?.username} 吗？封禁后该用户将无法登录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">封禁原因（可选）</label>
            <Input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="请输入封禁原因..."
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBanReason("")}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (banningUser) {
                  banUserMutation.mutate({
                    userId: banningUser.id,
                    reason: banReason || undefined,
                  });
                }
              }}
            >
              确认封禁
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
