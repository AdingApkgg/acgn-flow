"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Home,
  Search,
  Upload,
  User,
  Settings,
  Heart,
  History,
  Video,
  Tag,
  LogIn,
  LogOut,
  Moon,
  Sun,
  Monitor,
  MessageSquare,
  Shield,
  Keyboard,
} from "lucide-react";
import { useStableSession } from "@/lib/hooks";
import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { useSearchHistoryStore } from "@/stores/app";

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setIsOpen = onOpenChange ?? setInternalOpen;

  const router = useRouter();
  const { session } = useStableSession();
  const { theme, setTheme } = useTheme();
  const { history: searchHistory, addSearch } = useSearchHistoryStore();
  const [searchValue, setSearchValue] = useState("");

  // 全局快捷键监听
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Ctrl+K 或 Cmd+K 打开命令面板
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
      // / 键打开搜索（非输入框时）
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isOpen, setIsOpen]);

  const runCommand = useCallback(
    (command: () => void) => {
      setIsOpen(false);
      command();
    },
    [setIsOpen]
  );

  const handleSearch = () => {
    if (searchValue.trim()) {
      addSearch(searchValue.trim());
      runCommand(() => router.push(`/search?q=${encodeURIComponent(searchValue.trim())}`));
    }
  };

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      title="命令面板"
      description="快速导航和操作"
    >
      <CommandInput
        placeholder="搜索视频、页面或命令..."
        value={searchValue}
        onValueChange={setSearchValue}
        onKeyDown={(e) => {
          if (e.key === "Enter" && searchValue.trim()) {
            e.preventDefault();
            handleSearch();
          }
        }}
      />
      <CommandList>
        <CommandEmpty>未找到相关内容</CommandEmpty>

        {/* 搜索建议 */}
        {searchValue.trim() && (
          <CommandGroup heading="搜索">
            <CommandItem onSelect={handleSearch}>
              <Search className="mr-2 h-4 w-4" />
              搜索 &quot;{searchValue}&quot;
            </CommandItem>
          </CommandGroup>
        )}

        {/* 搜索历史 */}
        {!searchValue && searchHistory.length > 0 && (
          <CommandGroup heading="最近搜索">
            {searchHistory.slice(0, 5).map((query) => (
              <CommandItem
                key={query}
                onSelect={() => {
                  addSearch(query);
                  runCommand(() => router.push(`/search?q=${encodeURIComponent(query)}`));
                }}
              >
                <History className="mr-2 h-4 w-4" />
                {query}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* 导航 */}
        <CommandGroup heading="导航">
          <CommandItem onSelect={() => runCommand(() => router.push("/"))}>
            <Home className="mr-2 h-4 w-4" />
            首页
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/tags"))}>
            <Tag className="mr-2 h-4 w-4" />
            标签
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/comments"))}>
            <MessageSquare className="mr-2 h-4 w-4" />
            留言板
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* 用户相关 */}
        {session ? (
          <CommandGroup heading="用户">
            <CommandItem onSelect={() => runCommand(() => router.push("/upload"))}>
              <Upload className="mr-2 h-4 w-4" />
              上传视频
              <CommandShortcut>⌘U</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => router.push("/my-videos"))}>
              <Video className="mr-2 h-4 w-4" />
              我的视频
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => router.push("/favorites"))}>
              <Heart className="mr-2 h-4 w-4" />
              我的收藏
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => router.push("/history"))}>
              <History className="mr-2 h-4 w-4" />
              观看历史
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
              <User className="mr-2 h-4 w-4" />
              个人设置
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
              <Settings className="mr-2 h-4 w-4" />
              设置
            </CommandItem>
            {(session.user.role === "ADMIN" || session.user.role === "OWNER") && (
              <CommandItem onSelect={() => runCommand(() => router.push("/dashboard"))}>
                <Shield className="mr-2 h-4 w-4" />
                管理后台
              </CommandItem>
            )}
            <CommandSeparator />
            <CommandItem
              onSelect={() => runCommand(() => signOut({ callbackUrl: "/" }))}
            >
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </CommandItem>
          </CommandGroup>
        ) : (
          <CommandGroup heading="账户">
            <CommandItem onSelect={() => runCommand(() => router.push("/login"))}>
              <LogIn className="mr-2 h-4 w-4" />
              登录
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => router.push("/register"))}>
              <User className="mr-2 h-4 w-4" />
              注册
            </CommandItem>
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* 主题切换 */}
        <CommandGroup heading="主题">
          <CommandItem onSelect={() => runCommand(() => setTheme("light"))}>
            <Sun className="mr-2 h-4 w-4" />
            浅色模式
            {theme === "light" && <CommandShortcut>✓</CommandShortcut>}
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("dark"))}>
            <Moon className="mr-2 h-4 w-4" />
            深色模式
            {theme === "dark" && <CommandShortcut>✓</CommandShortcut>}
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => setTheme("system"))}>
            <Monitor className="mr-2 h-4 w-4" />
            跟随系统
            {theme === "system" && <CommandShortcut>✓</CommandShortcut>}
          </CommandItem>
        </CommandGroup>

        {/* 快捷键提示 */}
        <CommandSeparator />
        <CommandGroup heading="快捷键">
          <CommandItem disabled>
            <Keyboard className="mr-2 h-4 w-4" />
            <span className="flex-1">打开命令面板</span>
            <CommandShortcut>⌘K</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
