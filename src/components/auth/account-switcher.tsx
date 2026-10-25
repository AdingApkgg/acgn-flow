import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, UserCircle, X } from "lucide-react";

import { useEffect, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient, useSession } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
import { type SavedAccount, useAccountsStore } from "@/stores/accounts";

export function AccountSwitcher() {
  const { data: session, update: updateSession } = useSession();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { accounts, addAccount, removeAccount } = useAccountsStore();
  const queryClient = useQueryClient();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const { data: currentUser } = useQuery(
    orpc.user.me.queryOptions({ enabled: !!session?.user?.id }),
  );
  const { data: deviceSessions = [], refetch: refetchDeviceSessions } = useQuery({
    queryKey: ["auth", "device-sessions"],
    queryFn: async () => {
      const result = await authClient.multiSession.listDeviceSessions();
      if (result.error) throw new Error(result.error.message || "获取账号会话失败");
      return result.data || [];
    },
    enabled: !!session?.user?.id,
  });
  useEffect(() => {
    if (currentUser && session?.user?.id)
      addAccount({
        id: currentUser.id,
        email: currentUser.email,
        username: currentUser.username,
        nickname: currentUser.nickname,
        avatar: currentUser.avatar,
      });
  }, [currentUser, session?.user?.id, addAccount]);
  const otherAccounts = accounts.filter((account) => account.id !== session?.user?.id);
  const switchToAccount = async (account: SavedAccount) => {
    setSwitchingTo(account.id);
    try {
      const sessions = await refetchDeviceSessions();
      const target = sessions.data?.find((item) => item.user.id === account.id);
      if (!target) {
        toast.error("需要重新登录", { description: "该账号的登录会话已过期或被撤销" });
        navigate(`/login?account=${encodeURIComponent(account.email)}`);
        return;
      }
      const result = await authClient.multiSession.setActive({
        sessionToken: target.session.token,
      });
      if (result.error) throw new Error(result.error.message || "切换失败");
      queryClient.clear();
      await updateSession();
      await revalidator.revalidate();
      toast.success("已切换账号", {
        description: `欢迎回来，${account.nickname || account.username}`,
      });
    } catch (error) {
      toast.error("切换失败", { description: error instanceof Error ? error.message : "请重试" });
    } finally {
      setSwitchingTo(null);
    }
  };
  const addNewAccount = () => navigate("/login?new=1");
  const handleRemoveAccount = async (event: React.MouseEvent, accountId: string) => {
    event.stopPropagation();
    try {
      for (const item of deviceSessions.filter((item) => item.user.id === accountId)) {
        const result = await authClient.multiSession.revoke({ sessionToken: item.session.token });
        if (result.error) throw new Error(result.error.message || "撤销会话失败");
      }
      removeAccount(accountId);
      await refetchDeviceSessions();
      toast.success("已移除账号");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除账号失败");
    }
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
                  <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
                </div>
                <Check className="h-4 w-4 text-primary flex-shrink-0" />
              </div>
              <DropdownMenuSeparator />
            </>
          )}

          {/* 其他已保存的账号 */}
          {otherAccounts.map((account) => {
            const isSwitching = switchingTo === account.id;
            const hasToken = deviceSessions.some((item) => item.user.id === account.id);

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
                    type="button"
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
