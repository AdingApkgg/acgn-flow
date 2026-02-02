"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Home,
  Search,
  Upload,
  Heart,
  History,
  Video,
  MessageSquare,
  Settings,
  Shield,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStableSession } from "@/lib/hooks";
import type { Session } from "next-auth";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  auth?: boolean;
  permission?: string;
}

const mainNavItems: NavItem[] = [
  { href: "/", icon: Home, label: "首页" },
  { href: "/search", icon: Search, label: "搜索" },
];

const userNavItems: NavItem[] = [
  { href: "/my-videos", icon: Video, label: "我的视频", auth: true },
  { href: "/favorites", icon: Heart, label: "收藏", auth: true },
  { href: "/history", icon: History, label: "历史", auth: true },
];

const moreNavItems: NavItem[] = [
  { href: "/comments", icon: MessageSquare, label: "留言板" },
  { href: "/upload", icon: Upload, label: "上传视频", auth: true },
];

const settingsNavItems: NavItem[] = [
  { href: "/profile", icon: User, label: "个人信息", auth: true },
  { href: "/settings", icon: Settings, label: "设置", auth: true },
  { href: "/dashboard", icon: Shield, label: "管理面板", auth: true },
];

function NavLink({
  item,
  collapsed,
  isActive,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
}) {
  const content = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
        "hover:bg-accent hover:text-accent-foreground",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function NavGroup({
  title,
  items,
  collapsed,
  pathname,
  session,
}: {
  title?: string;
  items: NavItem[];
  collapsed: boolean;
  pathname: string;
  session: Session | null;
}) {
  const filteredItems = items.filter((item) => {
    if (item.auth && !session) return false;
    return true;
  });

  if (filteredItems.length === 0) return null;

  return (
    <div className="space-y-1">
      {title && !collapsed && (
        <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          {title}
        </h3>
      )}
      {filteredItems.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          collapsed={collapsed}
          isActive={pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))}
        />
      ))}
    </div>
  );
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { session } = useStableSession();

  // 侧边栏展开时锁定页面滚动，防止布局抖动
  useEffect(() => {
    if (!collapsed) {
      // 获取滚动条宽度
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [collapsed]);

  return (
    <>
      {/* 遮罩层 - 展开时显示 */}
      {!collapsed && (
        <div 
          className="fixed inset-0 top-16 z-30 bg-black/50 hidden md:block"
          onClick={onToggle}
        />
      )}
      
      <aside
        className={cn(
          "fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] border-r bg-background transition-all duration-300 ease-in-out",
          "hidden md:flex md:flex-col",
          // 始终显示，展开时宽度更大
          collapsed ? "w-[72px]" : "w-[240px]"
        )}
      >
        <ScrollArea className="flex-1 py-4">
          <div className={cn("space-y-6", collapsed ? "px-2" : "px-3")}>
            <NavGroup items={mainNavItems} collapsed={collapsed} pathname={pathname} session={session} />
            
            <Separator className={collapsed ? "mx-auto w-8" : ""} />
            
            {session && (
              <>
                <NavGroup
                  title="你的内容"
                  items={userNavItems}
                  collapsed={collapsed}
                  pathname={pathname}
                  session={session}
                />
                <Separator className={collapsed ? "mx-auto w-8" : ""} />
              </>
            )}
            
            <NavGroup
              title="探索"
              items={moreNavItems}
              collapsed={collapsed}
              pathname={pathname}
              session={session}
            />
            
            {session && (
              <>
                <Separator className={collapsed ? "mx-auto w-8" : ""} />
                <NavGroup
                  title="设置"
                  items={settingsNavItems}
                  collapsed={collapsed}
                  pathname={pathname}
                  session={session}
                />
              </>
            )}
          </div>
        </ScrollArea>

        {/* 折叠按钮 */}
        <div className={cn("border-t p-2", collapsed ? "flex justify-center" : "")}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className={cn(
              "w-full justify-center gap-2",
              collapsed && "w-auto px-2"
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>收起</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </>
  );
}

// 移动端侧边栏内容（用于 Sheet）
export function MobileSidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { session } = useStableSession();

  const handleClick = () => {
    onClose?.();
  };

  return (
    <ScrollArea className="h-full py-4">
      <div className="space-y-6 px-3">
        <NavGroupMobile
          items={mainNavItems}
          pathname={pathname}
          session={session}
          onClick={handleClick}
        />
        
        <Separator />
        
        {session && (
          <>
            <NavGroupMobile
              title="你的内容"
              items={userNavItems}
              pathname={pathname}
              session={session}
              onClick={handleClick}
            />
            <Separator />
          </>
        )}
        
        <NavGroupMobile
          title="探索"
          items={moreNavItems}
          pathname={pathname}
          session={session}
          onClick={handleClick}
        />
        
        {session && (
          <>
            <Separator />
            <NavGroupMobile
              title="设置"
              items={settingsNavItems}
              pathname={pathname}
              session={session}
              onClick={handleClick}
            />
          </>
        )}
      </div>
    </ScrollArea>
  );
}

function NavGroupMobile({
  title,
  items,
  pathname,
  session,
  onClick,
}: {
  title?: string;
  items: NavItem[];
  pathname: string;
  session: Session | null;
  onClick?: () => void;
}) {
  const filteredItems = items.filter((item) => {
    if (item.auth && !session) return false;
    return true;
  });

  if (filteredItems.length === 0) return null;

  return (
    <div className="space-y-1">
      {title && (
        <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          {title}
        </h3>
      )}
      {filteredItems.map((item) => {
        const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              "hover:bg-accent hover:text-accent-foreground",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground"
            )}
          >
            <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
