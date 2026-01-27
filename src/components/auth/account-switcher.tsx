"use client";

import { useEffect } from "react";
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
import { Check, Plus, UserCircle, X } from "lucide-react";
import { useAccountsStore, type SavedAccount } from "@/stores/accounts";
import { trpc } from "@/lib/trpc";

export function AccountSwitcher() {
  const { data: session } = useSession();
  const router = useRouter();
  const { accounts, addAccount, removeAccount } = useAccountsStore();

  // 获取当前用户详细信息并保存到 store
  const { data: currentUser } = trpc.user.me.useQuery(undefined, {
    enabled: !!session?.user?.id,
  });

  // 当登录成功时保存账号信息
  useEffect(() => {
    if (currentUser && session?.user) {
      addAccount({
        id: currentUser.id,
        email: currentUser.email,
        username: currentUser.username,
        nickname: currentUser.nickname,
        avatar: currentUser.avatar,
      });
    }
  }, [currentUser, session, addAccount]);

  // 过滤掉当前账号
  const otherAccounts = accounts.filter((a) => a.id !== session?.user?.id);

  // 切换账号
  const switchToAccount = (account: SavedAccount) => {
    // 跳转到登录页并预填账号，登录成功后会自动替换当前 session
    router.push(`/login?account=${encodeURIComponent(account.email)}`);
  };

  // 添加新账号
  const addNewAccount = () => {
    // 跳转到登录页，登录成功后会自动替换当前 session
    router.push("/login?new=1");
  };

  // 移除已保存的账号
  const handleRemoveAccount = (e: React.MouseEvent, accountId: string) => {
    e.stopPropagation();
    removeAccount(accountId);
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
          {otherAccounts.map((account) => (
            <DropdownMenuItem
              key={account.id}
              className="flex items-center gap-3 p-2 cursor-pointer group"
              onClick={() => switchToAccount(account)}
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
                </p>
              </div>
              <button
                onClick={(e) => handleRemoveAccount(e, account.id)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-opacity"
                title="移除账号"
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </DropdownMenuItem>
          ))}

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
