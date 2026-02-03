"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { Footer } from "./footer";
import { BottomNav } from "./bottom-nav";
import { CommandPalette } from "./command-palette";
import { cn } from "@/lib/utils";
import { useIsMounted } from "@/components/motion";

const SIDEBAR_COLLAPSED_KEY = "acgn-flow-sidebar-collapsed";

// 这些页面侧边栏覆盖模式（展开时覆盖内容，不推移）
const overlaySidebarPaths = ["/video/"];

// 这些页面完全不显示侧边栏
const noSidebarPaths = ["/login", "/register", "/forgot-password"];

function isOverlaySidebarPage(pathname: string): boolean {
  return overlaySidebarPaths.some(path => pathname.startsWith(path));
}

function shouldHideSidebar(pathname: string): boolean {
  return noSidebarPaths.some(path => pathname.startsWith(path));
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mounted = useIsMounted();
  
  // 判断页面类型
  const isOverlayMode = isOverlaySidebarPage(pathname);
  const isNoSidebarPage = shouldHideSidebar(pathname);
  
  // YouTube 风格：默认展开侧边栏
  // 使用惰性初始化避免 effect 中 setState
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === null ? true : saved !== "true";
  });
  
  // 视频页面独立的展开状态（默认隐藏）
  const [videoPageSidebarOpen, setVideoPageSidebarOpen] = useState(false);
  
  // 追踪上一次的 pathname 来重置视频页面侧边栏
  const prevPathnameRef = useRef(pathname);

  // 当 localStorage 变化时同步状态
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SIDEBAR_COLLAPSED_KEY && e.newValue !== null) {
        setSidebarExpanded(e.newValue !== "true");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
  
  // 切换页面时重置视频页面的侧边栏状态
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      // 使用 requestAnimationFrame 避免同步 setState
      requestAnimationFrame(() => setVideoPageSidebarOpen(false));
    }
  }, [pathname]);

  const toggleSidebar = () => {
    if (isOverlayMode) {
      // 视频页面只切换临时覆盖状态
      setVideoPageSidebarOpen(prev => !prev);
    } else {
      // 其他页面切换全局状态并保存
      const newState = !sidebarExpanded;
      setSidebarExpanded(newState);
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(!newState));
    }
  };

  // 是否显示侧边栏组件（非覆盖模式始终显示，覆盖模式需等待挂载）
  const showSidebar = isOverlayMode ? (mounted && !isNoSidebarPage) : !isNoSidebarPage;
  
  // 侧边栏是否展开
  const isExpanded = isOverlayMode ? videoPageSidebarOpen : sidebarExpanded;
  
  // 是否使用覆盖模式
  const useOverlayMode = isOverlayMode;

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden">
      <Header onMenuClick={toggleSidebar} />
      
      <div className="flex flex-1">
        {/* 桌面端侧边栏 */}
        {showSidebar && (
          <Sidebar 
            collapsed={!isExpanded} 
            onToggle={toggleSidebar}
            overlay={useOverlayMode}
          />
        )}
        
        {/* 主内容区 */}
        <main
          className={cn(
            "flex-1 flex flex-col min-h-[calc(100vh-4rem)] min-w-0 overflow-x-hidden transition-[margin] duration-300",
            // YouTube 风格：展开时内容区推移（非覆盖模式）
            showSidebar && !useOverlayMode && isExpanded && "md:ml-[240px]",
            showSidebar && !useOverlayMode && !isExpanded && "md:ml-[72px]",
            // 覆盖模式：固定小边距
            showSidebar && useOverlayMode && "md:ml-0",
            // 移动端为底部导航栏留出空间
            !isOverlayMode && "pb-16 md:pb-0"
          )}
        >
          <div className="flex-1">{children}</div>
          <Footer />
        </main>
      </div>

      {/* 移动端底部导航栏 */}
      {showSidebar && !isOverlayMode && <BottomNav />}

      {/* 全局命令面板 */}
      <CommandPalette />
    </div>
  );
}
