"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
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
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, LogOut, Trash2, AlertTriangle } from "lucide-react";

export default function DangerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data: user, isLoading: userLoading } = trpc.user.me.useQuery(
    undefined,
    { enabled: !!session }
  );

  const deleteAccountMutation = trpc.user.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success("账号已注销");
      signOut({ callbackUrl: "/" });
    },
    onError: (error) => {
      toast.error(error.message);
      setIsDeleting(false);
    },
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/settings/danger");
    }
  }, [status, router]);

  const handleLogout = () => {
    signOut({ callbackUrl: "/" });
  };

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmText !== "DELETE") {
      toast.error("请输入 DELETE 确认");
      return;
    }
    if (!deletePassword) {
      toast.error("请输入密码");
      return;
    }
    setIsDeleting(true);
    await deleteAccountMutation.mutateAsync({
      password: deletePassword,
      confirmText: "DELETE",
    });
  }, [deleteConfirmText, deletePassword, deleteAccountMutation]);

  if (status === "loading" || userLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!session || !user) return null;

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div>
        <h2 className="text-xl font-semibold text-destructive">危险操作</h2>
        <p className="text-sm text-muted-foreground mt-1">
          这些操作可能会影响你的账号，请谨慎操作
        </p>
      </div>

      {/* 危险区域 */}
      <div className="rounded-lg border border-destructive/30 overflow-hidden">
        {/* 退出登录 */}
        <div className="flex items-center justify-between p-4 bg-card">
          <div>
            <p className="font-medium">退出登录</p>
            <p className="text-sm text-muted-foreground">退出当前设备的登录状态</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <LogOut className="h-4 w-4 mr-2" />
                退出登录
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确定要退出登录吗？</AlertDialogTitle>
                <AlertDialogDescription>
                  退出后需要重新登录才能访问个人功能。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>确定退出</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="border-t border-destructive/30" />

        {/* 注销账号 */}
        <div className="flex items-center justify-between p-4 bg-destructive/5">
          <div>
            <p className="font-medium text-destructive">注销账号</p>
            <p className="text-sm text-muted-foreground">
              永久删除你的账号，视频将转移给站长
            </p>
          </div>
          <Dialog 
            open={deleteDialogOpen} 
            onOpenChange={(open) => {
              setDeleteDialogOpen(open);
              if (!open) {
                setDeletePassword("");
                setDeleteConfirmText("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="destructive" disabled={user?.role === "OWNER"}>
                <Trash2 className="h-4 w-4 mr-2" />
                注销账号
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  注销账号
                </DialogTitle>
                <DialogDescription>
                  此操作不可撤销。你的账号将被永久删除，上传的视频和播放列表将转移给站长。
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">请输入密码确认身份</label>
                  <Input
                    type="password"
                    placeholder="输入密码"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    请输入 <code className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-mono text-xs">DELETE</code> 确认注销
                  </label>
                  <Input
                    type="text"
                    placeholder="DELETE"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || deleteConfirmText !== "DELETE" || !deletePassword}
                >
                  {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  确认注销
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {user?.role === "OWNER" && (
          <div className="px-4 pb-4 bg-destructive/5">
            <p className="text-xs text-muted-foreground">
              站长账号不能注销，请先在用户管理中转让站长权限。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
