"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
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
  Clock,
  TrendingUp,
  X,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SettingsPanelInMenu } from "./settings-panel";
import { MobileSidebarContent } from "./sidebar";
import { useIsMounted } from "@/components/motion";
import { trpc } from "@/lib/trpc";
import { useDebounce, useStableSession } from "@/lib/hooks";

const SEARCH_HISTORY_KEY = "acgn-flow-search-history";
const MAX_HISTORY_ITEMS = 10;

// 搜索历史管理
function getSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const history = localStorage.getItem(SEARCH_HISTORY_KEY);
    return history ? JSON.parse(history) : [];
  } catch {
    return [];
  }
}

function addSearchHistory(query: string) {
  if (typeof window === "undefined" || !query.trim()) return;
  try {
    const history = getSearchHistory();
    const filtered = history.filter(h => h !== query.trim());
    const updated = [query.trim(), ...filtered].slice(0, MAX_HISTORY_ITEMS);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

function removeSearchHistory(query: string) {
  if (typeof window === "undefined") return;
  try {
    const history = getSearchHistory();
    const updated = history.filter(h => h !== query);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

function clearSearchHistory() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch {
    // ignore
  }
}

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { session, isLoading: sessionLoading } = useStableSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      return getSearchHistory();
    }
    return [];
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const mounted = useIsMounted();
  const router = useRouter();

  const isLoading = !mounted || sessionLoading;

  // 防抖搜索
  const debouncedQuery = useDebounce(searchQuery, 300);

  // 获取搜索建议
  const { data: suggestions } = trpc.video.searchSuggestions.useQuery(
    { query: debouncedQuery, limit: 5 },
    {
      enabled: debouncedQuery.length >= 2,
      staleTime: 60000,
    }
  );

  // 获取热搜
  const { data: hotSearches } = trpc.video.getHotSearches.useQuery(
    { limit: 8 },
    { staleTime: 300000 }
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

  // 记录搜索到服务器
  const recordSearchMutation = trpc.video.recordSearch.useMutation();

  const handleSearch = useCallback((query: string) => {
    if (query.trim()) {
      const trimmed = query.trim();
      addSearchHistory(trimmed);
      setSearchHistory(getSearchHistory());
      recordSearchMutation.mutate({ keyword: trimmed });
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      setShowMobileSearch(false);
      setShowSuggestions(false);
      setSearchQuery("");
    }
  }, [router, recordSearchMutation]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(searchQuery);
  };

  const handleSuggestionClick = (type: "video" | "tag", value: string) => {
    setShowSuggestions(false);
    if (type === "video") {
      router.push(`/video/${value}`);
    } else {
      router.push(`/tag/${value}`);
    }
  };

  const handleRemoveHistory = (e: React.MouseEvent, query: string) => {
    e.stopPropagation();
    removeSearchHistory(query);
    setSearchHistory(getSearchHistory());
  };

  const handleClearHistory = () => {
    clearSearchHistory();
    setSearchHistory([]);
  };

  const hasSuggestions =
    suggestions && (suggestions.videos.length > 0 || suggestions.tags.length > 0);
  
  const showHistoryOrHot = !debouncedQuery && (searchHistory.length > 0 || (hotSearches && hotSearches.length > 0));

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center px-4">
        {/* Left Section - Menu & Logo */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Desktop Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            onClick={onMenuClick}
            aria-label="切换侧边栏"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" aria-label="打开菜单">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b px-4 py-4">
                <SheetTitle>
                  <Link 
                    href="/" 
                    className="flex items-center gap-1 font-bold text-xl"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <span className="text-gradient-anime">ACGN</span>
                    <span>Flow</span>
                  </Link>
                </SheetTitle>
              </SheetHeader>
              <MobileSidebarContent onClose={() => setMobileMenuOpen(false)} />
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link href="/" className="flex items-center gap-1 font-bold text-xl group">
            <span className="text-gradient-anime transition-transform duration-200 hover:scale-105 active:scale-95">
              ACGN
            </span>
            <span className="text-foreground group-hover:text-primary transition-colors hidden sm:inline">
              Flow
            </span>
          </Link>
        </div>

        {/* Center Section - Search (居中) */}
        <div className="flex-1 flex justify-center px-4 lg:px-8">
          <form onSubmit={handleSearchSubmit} className="hidden md:flex w-full max-w-xl">
          <div className="relative w-full">
            <div className="flex">
              <Input
                ref={searchInputRef}
                type="search"
                placeholder="搜索"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                className="rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                autoComplete="off"
              />
              <Button 
                type="submit" 
                variant="secondary" 
                className="rounded-l-none border border-input border-l-0 px-6"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            
            {/* 搜索建议/历史/热搜下拉 */}
            {showSuggestions && (hasSuggestions || showHistoryOrHot) && (
              <div
                ref={suggestionsRef}
                className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 overflow-hidden max-h-[400px] overflow-y-auto"
              >
                {/* 有输入时显示搜索建议 */}
                {debouncedQuery.length >= 2 && hasSuggestions && (
                  <>
                    {suggestions.tags.length > 0 && (
                      <div className="p-2">
                        <div className="text-xs text-muted-foreground px-2 py-1">标签</div>
                        {suggestions.tags.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => handleSuggestionClick("tag", tag.slug)}
                            className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-accent rounded-md text-left"
                          >
                            <Tag className="h-4 w-4 text-muted-foreground" />
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
                            className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-accent rounded-md text-left"
                          >
                            <Film className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate">{video.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* 无输入时显示搜索历史和热搜 */}
                {!debouncedQuery && (
                  <>
                    {/* 搜索历史 */}
                    {searchHistory.length > 0 && (
                      <div className="p-2">
                        <div className="flex items-center justify-between px-2 py-1">
                          <span className="text-xs text-muted-foreground">搜索历史</span>
                          <button
                            type="button"
                            onClick={handleClearHistory}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            清空
                          </button>
                        </div>
                        {searchHistory.slice(0, 5).map((query) => (
                          <button
                            key={query}
                            type="button"
                            onClick={() => handleSearch(query)}
                            className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-accent rounded-md text-left group"
                          >
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="flex-1 truncate">{query}</span>
                            <X
                              className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                              onClick={(e) => handleRemoveHistory(e, query)}
                            />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 热搜榜 */}
                    {hotSearches && hotSearches.length > 0 && (
                      <div className={`p-2 ${searchHistory.length > 0 ? "border-t" : ""}`}>
                        <div className="text-xs text-muted-foreground px-2 py-1 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          热搜榜
                        </div>
                        {hotSearches.map((item, index) => (
                          <button
                            key={item.keyword}
                            type="button"
                            onClick={() => handleSearch(item.keyword)}
                            className="w-full flex items-center gap-3 px-2 py-2 text-sm hover:bg-accent rounded-md text-left"
                          >
                            <span className={`w-5 text-center text-xs font-bold ${
                              index < 3 ? "text-primary" : "text-muted-foreground"
                            }`}>
                              {index + 1}
                            </span>
                            <span className="truncate flex-1">{item.keyword}</span>
                            {item.isHot && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-medium">
                                热
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          </form>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-1 shrink-0">
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

          {isLoading ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          ) : session?.user ? (
            <>
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
                    <Link href="/settings">
                      <User className="mr-2 h-4 w-4" />
                      个人设置
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
                    <Link href="/dashboard">
                      <Shield className="mr-2 h-4 w-4" />
                      管理面板
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/* 外观设置 */}
                  <SettingsPanelInMenu />
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
            <div className="flex items-center gap-1">
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
      
      {/* Mobile Search */}
      <div
        className={`border-t bg-background/95 md:hidden overflow-hidden transition-all duration-200 ${
          showMobileSearch ? "max-h-16 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <form onSubmit={handleSearchSubmit} className="p-2">
          <div className="relative flex">
            <Input
              type="search"
              placeholder="搜索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-r-none border-r-0 text-sm"
              autoComplete="off"
            />
            <Button 
              type="submit" 
              variant="secondary" 
              size="sm"
              className="rounded-l-none border border-input border-l-0"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </header>
  );
}
