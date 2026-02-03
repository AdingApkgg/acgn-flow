"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Search,
  Upload,
  Heart,
  User,
} from "lucide-react";
import { useStableSession } from "@/lib/hooks";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  auth?: boolean;
  loginHref?: string;
}

const navItems: NavItem[] = [
  { href: "/", icon: Home, label: "首页" },
  { href: "/search", icon: Search, label: "搜索" },
  { href: "/upload", icon: Upload, label: "上传", auth: true, loginHref: "/login" },
  { href: "/favorites", icon: Heart, label: "收藏", auth: true, loginHref: "/login" },
  { href: "/settings", icon: User, label: "我的", auth: true, loginHref: "/login" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { session } = useStableSession();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden safe-area-bottom">
      <div className="flex h-14 items-center justify-around px-2">
        {navItems.map((item) => {
          // 对于需要登录的项，未登录时跳转到登录页
          const href = item.auth && !session ? (item.loginHref || "/login") : item.href;
          const isActive = pathname === item.href || 
            (item.href !== "/" && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[56px]",
                "active:scale-95 active:bg-accent/50",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 transition-transform",
                  isActive && "scale-110"
                )}
              />
              <span className={cn(
                "text-[10px] font-medium leading-tight",
                isActive && "font-semibold"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
