"use client";

import { trpc } from "@/lib/trpc";
import { Play, Users, Tag, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

const statItems = [
  { key: "videoCount", label: "视频", icon: Play, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  { key: "userCount", label: "用户", icon: Users, color: "text-green-500", bgColor: "bg-green-500/10" },
  { key: "tagCount", label: "标签", icon: Tag, color: "text-purple-500", bgColor: "bg-purple-500/10" },
  { key: "totalViews", label: "播放", icon: Eye, color: "text-orange-500", bgColor: "bg-orange-500/10" },
] as const;

export function SiteStats() {
  const { data, isLoading } = trpc.video.getPublicStats.useQuery(undefined, {
    staleTime: 15 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statItems.map((item) => (
          <div
            key={item.key}
            className="bg-card border rounded-xl p-4 flex items-center gap-3"
          >
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-4 w-8" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {statItems.map((item) => {
        const Icon = item.icon;
        const value = data[item.key];

        return (
          <div
            key={item.key}
            className="bg-card border rounded-xl p-4 flex items-center gap-3 cursor-default transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
          >
            <div className={`p-2.5 rounded-lg ${item.bgColor} ${item.color} transition-transform duration-200 hover:scale-105`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums">
                {formatNumber(value)}
              </div>
              <div className="text-xs text-muted-foreground">{item.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
