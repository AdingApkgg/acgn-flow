"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { Footer } from "./footer";
import { cn } from "@/lib/utils";
import { useIsMounted } from "@/components/motion";

const SIDEBAR_COLLAPSED_KEY = "acgn-flow-sidebar-collapsed";

// 这些页面不显示侧边栏（全屏体验）
const fullscreenPaths = ["/video/", "/login", "/register", "/forgot-password"];

function isFullscreenPage(pathname: string): boolean {
  return fullscreenPaths.some(path => pathname.startsWith(path));
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mounted = useIsMounted();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // 使用 lazy initialization 从 localStorage 读取侧边栏状态
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });

  // 当 localStorage 变化时同步状态（用于多标签页同步）
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SIDEBAR_COLLAPSED_KEY && e.newValue !== null) {
        setSidebarCollapsed(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newState));
  };

  const isFullscreen = isFullscreenPage(pathname);
  const showSidebar = mounted && !isFullscreen;

  return (
    <div className="relative min-h-screen flex flex-col">
      <Header onMenuClick={toggleSidebar} />
      
      <div className="flex flex-1">
        {/* 桌面端侧边栏 */}
        {showSidebar && (
          <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        )}
        
        {/* 主内容区 */}
        <main
          className={cn(
            "flex-1 flex flex-col min-h-[calc(100vh-4rem)]",
            // 桌面端根据侧边栏状态调整左边距
            showSidebar && (sidebarCollapsed ? "md:ml-[72px]" : "md:ml-[240px]"),
            "transition-all duration-300 ease-in-out"
          )}
        >
          <div className="flex-1">{children}</div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
