"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Users,
  Video,
  Tag,
  Settings,
  Shield,
  MessageSquare,
  Menu,
  Sparkles,
  ChevronLeft,
} from "lucide-react";

const menuItems = [
  {
    href: "/dashboard",
    label: "数据总览",
    icon: LayoutDashboard,
    scope: null,
  },
  {
    href: "/dashboard/videos",
    label: "视频管理",
    icon: Video,
    scope: "video:moderate",
  },
  {
    href: "/dashboard/users",
    label: "用户管理",
    icon: Users,
    scope: "user:view",
  },
  {
    href: "/dashboard/tags",
    label: "标签管理",
    icon: Tag,
    scope: "tag:manage",
  },
  {
    href: "/dashboard/comments",
    label: "评论管理",
    icon: MessageSquare,
    scope: "comment:manage",
  },
  {
    href: "/dashboard/settings",
    label: "系统设置",
    icon: Settings,
    scope: "settings:manage",
  },
];

function SidebarContent({
  permissions,
  pathname,
  onItemClick,
}: {
  permissions: {
    isOwner: boolean;
    isAdmin: boolean;
    scopes: string[];
    allScopes: Record<string, string>;
  } | undefined;
  pathname: string;
  onItemClick?: () => void;
}) {
  const hasScope = (scope: string | null) => {
    if (!scope) return true;
    if (!permissions) return false;
    return permissions.scopes.includes(scope);
  };

  const visibleMenuItems = menuItems.filter((item) => hasScope(item.scope));

  const getRoleBadge = () => {
    if (!permissions) return null;
    if (permissions.isOwner) {
      return (
        <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg">
          <Sparkles className="h-3 w-3 mr-1" />
          站长
        </Badge>
      );
    }
    if (permissions.isAdmin) {
      return <Badge variant="secondary">管理员</Badge>;
    }
    return <Badge variant="outline">用户</Badge>;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo / 标题 */}
      <div className="h-16 flex items-center px-4 border-b">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          <span>控制台</span>
        </Link>
      </div>

      {/* 导航菜单 */}
      <ScrollArea className="flex-1 py-4">
        <nav className="px-3 space-y-1">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* 底部信息 */}
      <div className="p-4 border-t space-y-3">
        {/* 权限标识 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">身份：</span>
          {getRoleBadge()}
        </div>

        {/* 权限说明 */}
        {permissions?.isAdmin && !permissions?.isOwner && (
          <div className="p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
            <p className="font-medium mb-1">权限范围：</p>
            <ul className="space-y-0.5 max-h-24 overflow-auto">
              {permissions.scopes.map((scope) => (
                <li key={scope} className="truncate">
                  • {permissions.allScopes[scope as keyof typeof permissions.allScopes] || scope}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 返回首页 */}
        <Button variant="outline" size="sm" asChild className="w-full">
          <Link href="/">
            <ChevronLeft className="mr-2 h-4 w-4" />
            返回首页
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: permissions, isLoading: permissionsLoading } =
    trpc.admin.getMyPermissions.useQuery(undefined, {
      enabled: !!session,
    });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/dashboard");
    }
  }, [status, router]);

  // 路由变化时关闭移动端菜单
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  if (status === "loading" || permissionsLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <div className="flex h-full">
          {/* 桌面端侧边栏骨架 */}
          <div className="hidden lg:block w-64 border-r bg-card">
            <div className="h-16 flex items-center px-4 border-b">
              <Skeleton className="h-8 w-32" />
            </div>
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
          {/* 移动端头部骨架 */}
          <div className="lg:hidden fixed top-0 left-0 right-0 h-16 border-b bg-card flex items-center px-4">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-6 w-24 ml-4" />
          </div>
          {/* 内容骨架 */}
          <div className="flex-1 p-6 pt-20 lg:pt-6">
            <Skeleton className="h-8 w-48 mb-6" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="flex h-full">
        {/* 桌面端侧边栏 */}
        <aside className="hidden lg:flex lg:flex-col w-64 border-r bg-card shrink-0">
          <SidebarContent permissions={permissions} pathname={pathname} />
        </aside>

        {/* 移动端头部 */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 border-b bg-card flex items-center px-4 gap-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="打开菜单">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64">
              <SidebarContent
                permissions={permissions}
                pathname={pathname}
                onItemClick={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold">控制台</span>
          </div>
        </div>

        {/* 主内容区 */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 lg:p-6 pt-20 lg:pt-6 min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
