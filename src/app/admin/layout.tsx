"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Users,
  Video,
  Tag,
  Settings,
  ChevronLeft,
  Shield,
  MessageSquare,
} from "lucide-react";

const menuItems = [
  {
    href: "/admin",
    label: "数据总览",
    icon: LayoutDashboard,
    scope: null, // 所有登录用户可见
  },
  {
    href: "/admin/videos",
    label: "视频管理",
    icon: Video,
    scope: "video:moderate",
  },
  {
    href: "/admin/users",
    label: "用户管理",
    icon: Users,
    scope: "user:view",
  },
  {
    href: "/admin/tags",
    label: "标签管理",
    icon: Tag,
    scope: "tag:manage",
  },
  {
    href: "/admin/comments",
    label: "评论管理",
    icon: MessageSquare,
    scope: "comment:manage",
  },
  {
    href: "/admin/settings",
    label: "系统设置",
    icon: Settings,
    scope: "settings:manage",
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const { data: permissions, isLoading: permissionsLoading } =
    trpc.admin.getMyPermissions.useQuery(undefined, {
      enabled: !!session,
    });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/admin");
    }
  }, [status, router]);

  if (status === "loading" || permissionsLoading) {
    return (
      <div className="container py-6">
        <div className="flex gap-6">
          <div className="w-64 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
          <div className="flex-1">
            <Skeleton className="h-[400px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const hasScope = (scope: string | null) => {
    if (!scope) return true;
    if (!permissions) return false;
    return permissions.scopes.includes(scope);
  };

  const visibleMenuItems = menuItems.filter((item) => hasScope(item.scope));

  const getRoleBadge = () => {
    if (!permissions) return null;
    if (permissions.isOwner) {
      return <Badge variant="default" className="bg-gradient-to-r from-amber-500 to-orange-500">站长</Badge>;
    }
    if (permissions.isAdmin) {
      return <Badge variant="secondary">管理员</Badge>;
    }
    return <Badge variant="outline">用户</Badge>;
  };

  return (
    <div className="container py-6">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* 侧边栏 */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="sticky top-20 space-y-4">
            {/* 返回首页 */}
            <Button variant="ghost" size="sm" asChild className="w-full justify-start">
              <Link href="/">
                <ChevronLeft className="mr-2 h-4 w-4" />
                返回首页
              </Link>
            </Button>

            {/* 权限标识 */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">当前身份</span>
              {getRoleBadge()}
            </div>

            {/* 导航菜单 */}
            <nav className="space-y-1">
              {visibleMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* 权限说明 */}
            {permissions?.isAdmin && !permissions?.isOwner && (
              <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <p className="font-medium mb-1">您的权限范围：</p>
                <ul className="space-y-0.5">
                  {permissions.scopes.map((scope) => (
                    <li key={scope}>
                      • {permissions.allScopes[scope as keyof typeof permissions.allScopes] || scope}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
