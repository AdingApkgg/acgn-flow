"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { AccountSwitcher } from "@/components/auth/account-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Search,
  Menu,
  Upload,
  User,
  LogOut,
  Heart,
  History,
  Video,
  Shield,
  LogIn,
  UserPlus,
  Tag,
  Film,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { SettingsPanel } from "./settings-panel";
import { useIsMounted } from "@/components/motion";
import { trpc } from "@/lib/trpc";
import { useDebounce } from "@/lib/hooks";

export function Header() {
  const { data: session, status } = useSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const mounted = useIsMounted();
  const router = useRouter();

  // 防抖搜索
  const debouncedQuery = useDebounce(searchQuery, 300);

  // 获取搜索建议
  const { data: suggestions } = trpc.video.searchSuggestions.useQuery(
    { query: debouncedQuery, limit: 5 },
    {
      enabled: debouncedQuery.length >= 2,
      staleTime: 60000, // 1 分钟内不重新请求
    }
  );

  // 点击外部关闭建议
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setShowMobileSearch(false);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (type: "video" | "tag", value: string) => {
    setShowSuggestions(false);
    if (type === "video") {
      router.push(`/video/${value}`);
    } else {
      router.push(`/tag/${value}`);
    }
  };

  const hasSuggestions =
    suggestions && (suggestions.videos.length > 0 || suggestions.tags.length > 0);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        {/* Left Section */}
        <div className="flex items-center gap-4 flex-1">
          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <VisuallyHidden>
                  <SheetTitle>导航菜单</SheetTitle>
                </VisuallyHidden>
              </SheetHeader>
              <nav className="flex flex-col gap-4 mt-4">
                <Link href="/" className="text-lg font-semibold">
                  首页
                </Link>
                <Link href="/tags" className="text-lg">
                  标签
                </Link>
                <Link href="/comments" className="text-lg">
                  留言
                </Link>
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-1 font-bold text-xl group">
            <span className="text-gradient-anime transition-transform duration-200 hover:scale-105 active:scale-95">
              ACGN
            </span>
            <span className="text-foreground group-hover:text-primary transition-colors">
              Flow
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 ml-6">
            <Link
              href="/tags"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              标签
            </Link>
            <Link
              href="/comments"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              留言
            </Link>
          </nav>
        </div>

        {/* Center Section - Search (Desktop) */}
        <form onSubmit={handleSearch} className="hidden md:flex w-full max-w-md mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="search"
              placeholder="搜索视频、标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              className="pl-10 w-full text-sm md:text-base"
              autoComplete="off"
            />
            {/* 搜索建议下拉 */}
            {showSuggestions && hasSuggestions && (
              <div
                ref={suggestionsRef}
                className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 overflow-hidden"
              >
                {suggestions.tags.length > 0 && (
                  <div className="p-2">
                    <div className="text-xs text-muted-foreground px-2 py-1">标签</div>
                    {suggestions.tags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => handleSuggestionClick("tag", tag.slug)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm text-left"
                      >
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>#{tag.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {suggestions.videos.length > 0 && (
                  <div className="p-2 border-t">
                    <div className="text-xs text-muted-foreground px-2 py-1">视频</div>
                    {suggestions.videos.map((video) => (
                      <button
                        key={video.id}
                        type="button"
                        onClick={() => handleSuggestionClick("video", video.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm text-left"
                      >
                        <Film className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{video.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </form>

        {/* Right Section */}
        <div className="flex items-center gap-1 sm:gap-2 flex-1 justify-end">
          {/* Settings Panel */}
          <SettingsPanel />

          {/* Mobile Search Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setShowMobileSearch((prev) => !prev)}
            aria-label="搜索"
          >
            <Search className="h-5 w-5" />
          </Button>

          {!mounted || status === "loading" ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          ) : session?.user ? (
            <>
              {/* Upload Button */}
              <Button variant="ghost" size="icon" asChild>
                <Link href="/upload">
                  <Upload className="h-5 w-5" />
                </Link>
              </Button>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-8 w-8 rounded-full"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={session.user.image || undefined}
                        alt={session.user.name || ""}
                      />
                      <AvatarFallback>
                        {session.user.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={session.user.image || undefined} />
                        <AvatarFallback>
                          {session.user.name?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col space-y-1 leading-none min-w-0">
                        <p className="font-medium truncate">{session.user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {session.user.email}
                        </p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile">
                      <User className="mr-2 h-4 w-4" />
                      个人信息
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/my-videos">
                      <Video className="mr-2 h-4 w-4" />
                      我的视频
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/favorites">
                      <Heart className="mr-2 h-4 w-4" />
                      我的收藏
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/history">
                      <History className="mr-2 h-4 w-4" />
                      观看历史
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      <Shield className="mr-2 h-4 w-4" />
                      管理面板
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <AccountSwitcher />
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => signOut()}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-1 sm:gap-2">
              <Button variant="ghost" size="sm" asChild className="px-2 sm:px-4">
                <Link href="/login">
                  <LogIn className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">登录</span>
                </Link>
              </Button>
              <Button size="sm" asChild className="px-2 sm:px-4">
                <Link href="/register">
                  <UserPlus className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">注册</span>
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
      {/* Mobile Search - use CSS to avoid hydration mismatch */}
      <div
        className={`border-t bg-background/95 md:hidden overflow-hidden transition-all duration-200 ${
          showMobileSearch ? "max-h-16 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <form onSubmit={handleSearch} className="container py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索视频、标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full text-sm"
              autoComplete="off"
            />
          </div>
        </form>
      </div>
    </header>
  );
}
