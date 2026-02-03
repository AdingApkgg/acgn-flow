"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  User,
  Shield,
  Link2,
  Smartphone,
  AlertTriangle,
} from "lucide-react";

const settingsNav = [
  { title: "个人资料", href: "/settings", icon: User },
  { title: "账号安全", href: "/settings/account", icon: Shield },
  { title: "账号绑定", href: "/settings/connections", icon: Link2 },
  { title: "登录管理", href: "/settings/sessions", icon: Smartphone },
  { title: "危险操作", href: "/settings/danger", icon: AlertTriangle, danger: true },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="container py-6 max-w-4xl">
      <div className="flex flex-col md:flex-row gap-8">
        {/* 侧边导航 - GitHub 风格 */}
        <nav className="w-full md:w-52 flex-shrink-0">
          <div className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-x-visible pb-3 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 border-b md:border-b-0">
            {settingsNav.map((item) => {
              const isActive = 
                item.href === "/settings" 
                  ? pathname === "/settings"
                  : pathname.startsWith(item.href);
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap",
                    isActive
                      ? "bg-accent font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                    item.danger && "text-destructive hover:text-destructive"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.title}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* 内容区域 */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
