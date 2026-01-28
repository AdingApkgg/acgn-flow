"use client";

import { trpc } from "@/lib/trpc";
import { Play, Users, Tag, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/motion";

function formatNumber(num: number): string {
  const rounded = Math.round(num);
  if (rounded >= 1000000) {
    return (rounded / 1000000).toFixed(1) + "M";
  }
  if (rounded >= 1000) {
    return (rounded / 1000).toFixed(1) + "K";
  }
  return rounded.toString();
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
      {statItems.map((item, index) => {
        const Icon = item.icon;
        const value = data[item.key];

        return (
          <div
            key={item.key}
            className="bg-card border rounded-xl p-4 flex items-center gap-3 cursor-default shadow-sm hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02] transition-all duration-200"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div 
              className={`p-2.5 rounded-lg ${item.bgColor} ${item.color} transition-transform duration-200 hover:scale-110 hover:rotate-3`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums">
                <CountUp value={value} duration={1.5} formatter={formatNumber} />
              </div>
              <div className="text-xs text-muted-foreground">{item.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
