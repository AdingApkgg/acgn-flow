import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SavedAccount {
  id: string;
  email: string;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  lastLoginAt: number;
}

interface AccountsState {
  accounts: SavedAccount[];
  addAccount: (account: Omit<SavedAccount, "lastLoginAt">) => void;
  removeAccount: (id: string) => void;
  updateAccount: (id: string, data: Partial<SavedAccount>) => void;
  getAccount: (id: string) => SavedAccount | undefined;
}

export const useAccountsStore = create<AccountsState>()(
  persist(
    (set, get) => ({
      accounts: [],

      addAccount: (account) => {
        set((state) => {
          const exists = state.accounts.find((a) => a.id === account.id);
          if (exists) {
            // 更新已存在的账号
            return {
              accounts: state.accounts.map((a) =>
                a.id === account.id ? { ...a, ...account, lastLoginAt: Date.now() } : a,
              ),
            };
          }
          // 添加新账号
          return {
            accounts: [...state.accounts, { ...account, lastLoginAt: Date.now() }],
          };
        });
      },

      removeAccount: (id) => {
        set((state) => ({
          accounts: state.accounts.filter((a) => a.id !== id),
        }));
      },

      updateAccount: (id, data) => {
        set((state) => ({
          accounts: state.accounts.map((a) => (a.id === id ? { ...a, ...data } : a)),
        }));
      },

      getAccount: (id) => {
        return get().accounts.find((a) => a.id === id);
      },
    }),
    {
      name: "acgn-accounts",
      version: 2,
      // 只保存账号展示资料，清理旧版本存储中的切换令牌。
      migrate: (persisted) => ({
        accounts: ((persisted as { accounts?: SavedAccount[] })?.accounts || []).map((account) => ({
          id: account.id,
          email: account.email,
          username: account.username,
          nickname: account.nickname,
          avatar: account.avatar,
          lastLoginAt: account.lastLoginAt,
        })),
      }),
      partialize: (state) => ({
        accounts: state.accounts.map((account) => ({
          id: account.id,
          email: account.email,
          username: account.username,
          nickname: account.nickname,
          avatar: account.avatar,
          lastLoginAt: account.lastLoginAt,
        })),
      }),
    },
  ),
);
