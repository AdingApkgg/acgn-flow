"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Check, Plus, UserCircle, X, Loader2 } from "lucide-react";
import { useAccountsStore, type SavedAccount } from "@/stores/accounts";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function AccountSwitcher() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const { accounts, addAccount, removeAccount, setSwitchToken, getSwitchToken } = useAccountsStore();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const hasGeneratedToken = useRef(false);

  // 获取当前用户详细信息
  const { data: currentUser } = trpc.user.me.useQuery(undefined, {
    enabled: !!session?.user?.id,
  });

  // 生成切换令牌
  const generateTokenMutation = trpc.user.generateSwitchToken.useMutation({
    onSuccess: (data) => {
      if (currentUser) {
        setSwitchToken(currentUser.id, data.token);
      }
    },
  });

  // 当登录成功时保存账号信息并生成切换令牌
  useEffect(() => {
    if (currentUser && session?.user) {
      addAccount({
        id: currentUser.id,
        email: currentUser.email,
        username: currentUser.username,
        nickname: currentUser.nickname,
        avatar: currentUser.avatar,
      });

      // 检查是否已有切换令牌，没有则生成（只生成一次）
      const existingToken = getSwitchToken(currentUser.id);
      if (!existingToken && !hasGeneratedToken.current && !generateTokenMutation.isPending) {
        hasGeneratedToken.current = true;
        generateTokenMutation.mutate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在用户 ID 变化时执行，避免无限循环
  }, [currentUser?.id, session?.user?.id]);

  // 过滤掉当前账号
  const otherAccounts = accounts.filter((a) => a.id !== session?.user?.id);

  // 快速切换账号（无需密码）
  const switchToAccount = async (account: SavedAccount) => {
    const token = getSwitchToken(account.id);
    
    if (!token) {
      // 没有令牌，需要重新登录
      toast.error("需要重新登录", { description: "该账号的快速切换令牌已过期" });
      router.push(`/login?account=${encodeURIComponent(account.email)}`);
      return;
    }

    setSwitchingTo(account.id);

    try {
      const response = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 令牌无效，清除并提示重新登录
        if (response.status === 401 || response.status === 404) {
          setSwitchToken(account.id, "");
          toast.error("需要重新登录", { description: data.error || "快速切换令牌已过期" });
          router.push(`/login?account=${encodeURIComponent(account.email)}`);
        } else {
          toast.error("切换失败", { description: data.error });
        }
        return;
      }

      // 切换成功，更新 session 并刷新页面
      toast.success("已切换账号", { description: `欢迎回来，${data.user.name}` });
      
      // 强制刷新 session
      await updateSession();
      
      // 刷新页面以确保所有状态更新
      router.refresh();
    } catch (error) {
      console.error("Switch account error:", error);
      toast.error("切换失败", { description: "网络错误，请重试" });
    } finally {
      setSwitchingTo(null);
    }
  };

  // 添加新账号
  const addNewAccount = () => {
    router.push("/login?new=1");
  };

  // 移除已保存的账号
  const handleRemoveAccount = (e: React.MouseEvent, accountId: string) => {
    e.stopPropagation();
    removeAccount(accountId);
    toast.success("已移除账号");
  };

  if (otherAccounts.length === 0) {
    return (
      <DropdownMenuItem onClick={addNewAccount}>
        <Plus className="mr-2 h-4 w-4" />
        添加账号
      </DropdownMenuItem>
    );
  }

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <UserCircle className="mr-2 h-4 w-4" />
          切换账号
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-64">
          {/* 当前账号 */}
          {session?.user && (
            <>
              <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-md mx-1">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={session.user.image || undefined} />
                  <AvatarFallback>
                    {session.user.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{session.user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {session.user.email}
                  </p>
                </div>
                <Check className="h-4 w-4 text-primary flex-shrink-0" />
              </div>
              <DropdownMenuSeparator />
            </>
          )}

          {/* 其他已保存的账号 */}
          {otherAccounts.map((account) => {
            const isSwitching = switchingTo === account.id;
            const hasToken = !!getSwitchToken(account.id);
            
            return (
              <DropdownMenuItem
                key={account.id}
                className="flex items-center gap-3 p-2 cursor-pointer group"
                onClick={() => !isSwitching && switchToAccount(account)}
                disabled={isSwitching}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={account.avatar || undefined} />
                  <AvatarFallback>
                    {(account.nickname || account.username).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {account.nickname || account.username}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {account.email}
                    {!hasToken && " · 需要登录"}
                  </p>
                </div>
                {isSwitching ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <button
                    onClick={(e) => handleRemoveAccount(e, account.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-opacity"
                    title="移除账号"
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={addNewAccount}>
            <Plus className="mr-2 h-4 w-4" />
            添加其他账号
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}
