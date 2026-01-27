"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Users, Search, Shield, Settings, Loader2 } from "lucide-react";
import { ADMIN_SCOPES } from "@/lib/constants";

type UserRole = "USER" | "ADMIN" | "OWNER";

interface UserItem {
  id: string;
  email: string;
  username: string;
  nickname: string | null;
  avatar: string | null;
  role: UserRole;
  adminScopes: unknown;
  createdAt: Date;
  _count: { videos: number };
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [editingScopes, setEditingScopes] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  const utils = trpc.useUtils();

  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.admin.listUsers.useInfiniteQuery(
      { limit: 20, search: search || undefined, role: roleFilter },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        enabled: permissions?.scopes.includes("user:view"),
      }
    );

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("用户角色已更新");
      utils.admin.listUsers.invalidate();
      setSelectedUser(null);
    },
    onError: (error) => {
      toast.error("更新失败", { description: error.message });
    },
  });

  const updateScopesMutation = trpc.admin.updateAdminScopes.useMutation({
    onSuccess: () => {
      toast.success("权限已更新");
      utils.admin.listUsers.invalidate();
      setSelectedUser(null);
    },
    onError: (error) => {
      toast.error("更新失败", { description: error.message });
    },
  });

  const users = data?.pages.flatMap((page) => page.users) || [];

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

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          用户管理
        </h1>
        <p className="text-muted-foreground mt-1">
          管理网站用户和权限分配
        </p>
      </motion.div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
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
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="角色筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部角色</SelectItem>
                <SelectItem value="USER">普通用户</SelectItem>
                <SelectItem value="ADMIN">管理员</SelectItem>
                <SelectItem value="OWNER">站长</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 用户列表 */}
      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <CardDescription>
            共 {users.length} 个用户{hasNextPage && "（加载更多...）"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array(5)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                ))}
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              没有找到用户
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user, index) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar || undefined} />
                    <AvatarFallback>
                      {(user.nickname || user.username).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {user.nickname || user.username}
                      </span>
                      {getRoleBadge(user.role)}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      @{user.username} · {user.email} · {user._count.videos} 个视频
                    </div>
                  </div>
                  {permissions?.isOwner && user.role !== "OWNER" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditUser(user)}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  )}
                </motion.div>
              ))}

              {hasNextPage && (
                <div className="text-center pt-4">
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
        </CardContent>
      </Card>

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
              {/* 用户信息 */}
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={selectedUser.avatar || undefined} />
                  <AvatarFallback>
                    {(selectedUser.nickname || selectedUser.username)
                      .charAt(0)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">
                    {selectedUser.nickname || selectedUser.username}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    @{selectedUser.username}
                  </div>
                </div>
              </div>

              {/* 角色选择 */}
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

              {/* 权限范围（仅管理员显示） */}
              {selectedUser.role === "ADMIN" && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">权限范围</label>
                  <div className="space-y-2">
                    {Object.entries(ADMIN_SCOPES).map(([scope, label]) => (
                      <div
                        key={scope}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          id={scope}
                          checked={editingScopes.includes(scope)}
                          onCheckedChange={() => toggleScope(scope)}
                          disabled={isUpdating}
                        />
                        <label
                          htmlFor={scope}
                          className="text-sm cursor-pointer"
                        >
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
    </div>
  );
}
