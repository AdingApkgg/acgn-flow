"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Upload,
  Heart,
  History,
  Video,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useStableSession } from "@/lib/hooks";
import type { Session } from "next-auth";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  overlay?: boolean; // 覆盖模式（展开时覆盖内容而非推移）
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
];

const userNavItems: NavItem[] = [
  { href: "/my-videos", icon: Video, label: "我的视频", auth: true },
  { href: "/favorites", icon: Heart, label: "收藏", auth: true },
  { href: "/history", icon: History, label: "历史", auth: true },
];

const moreNavItems: NavItem[] = [
  { href: "/upload", icon: Upload, label: "上传视频", auth: true },
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

// 用户个人主页链接
function UserProfileLink({ collapsed, session }: { collapsed: boolean; session: Session }) {
  const content = (
    <Link
      href={`/user/${session.user.id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
        "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      <Avatar className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-8 w-8")}>
        <AvatarImage src={session.user.image || undefined} alt={session.user.name || ""} />
        <AvatarFallback className="text-xs">
          {session.user.name?.charAt(0).toUpperCase() || <User className="h-3 w-3" />}
        </AvatarFallback>
      </Avatar>
      {!collapsed && (
        <div className="flex flex-col min-w-0">
          <span className="truncate">{session.user.name || "我的主页"}</span>
          <span className="text-xs text-muted-foreground truncate">查看个人主页</span>
        </div>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          我的主页
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

export function Sidebar({ collapsed, onToggle, overlay = false }: SidebarProps) {
  const pathname = usePathname();
  const { session } = useStableSession();

  // 覆盖模式展开时不需要特殊处理，侧边栏覆盖在内容上方

  return (
    <>
      {/* 遮罩层 - 覆盖模式展开时显示 */}
      <div 
        className={cn(
          "fixed inset-0 top-16 z-30 bg-black/50 hidden md:block transition-opacity duration-300",
          overlay && !collapsed ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onToggle}
      />
      
      <aside
        className={cn(
          "fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] border-r bg-background transition-all duration-300 ease-in-out",
          "hidden md:flex md:flex-col",
          // 覆盖模式：通过 translate 滑入滑出，避免闪烁
          overlay 
            ? collapsed ? "w-[240px] -translate-x-full" : "w-[240px] translate-x-0"
            : collapsed ? "w-[72px]" : "w-[240px]"
        )}
      >
        <ScrollArea className="flex-1 py-4">
          <div className={cn("space-y-4", collapsed ? "px-2" : "px-3")}>
            <NavGroup items={mainNavItems} collapsed={collapsed} pathname={pathname} session={session} />
            
            {session && (
              <>
                <Separator className={collapsed ? "mx-auto w-8" : ""} />
                
                {/* 用户个人主页入口 */}
                <UserProfileLink collapsed={collapsed} session={session} />
                
                <NavGroup
                  title={collapsed ? undefined : "你的内容"}
                  items={userNavItems}
                  collapsed={collapsed}
                  pathname={pathname}
                  session={session}
                />
              </>
            )}
            
            <Separator className={collapsed ? "mx-auto w-8" : ""} />
            
            <NavGroup
              items={moreNavItems}
              collapsed={collapsed}
              pathname={pathname}
              session={session}
            />
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
      <div className="space-y-4 px-3">
        <NavGroupMobile
          items={mainNavItems}
          pathname={pathname}
          session={session}
          onClick={handleClick}
        />
        
        {session && (
          <>
            <Separator />
            <NavGroupMobile
              title="你的内容"
              items={userNavItems}
              pathname={pathname}
              session={session}
              onClick={handleClick}
            />
          </>
        )}
        
        <Separator />
        
        <NavGroupMobile
          items={moreNavItems}
          pathname={pathname}
          session={session}
          onClick={handleClick}
        />
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
