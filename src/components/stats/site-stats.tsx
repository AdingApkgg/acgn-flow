"use client";

import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
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
  { key: "videoCount", label: "视频", icon: Play, color: "text-blue-500" },
  { key: "userCount", label: "用户", icon: Users, color: "text-green-500" },
  { key: "tagCount", label: "标签", icon: Tag, color: "text-purple-500" },
  { key: "totalViews", label: "播放", icon: Eye, color: "text-orange-500" },
] as const;

export function SiteStats() {
  const { data, isLoading } = trpc.video.getPublicStats.useQuery(undefined, {
    staleTime: 15 * 1000, // 15 seconds - 与后端缓存对齐
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
            <div className="space-y-1">
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
          <motion.div
            key={item.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            className="bg-card border rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-shadow"
          >
            <div className={`p-2.5 rounded-lg bg-muted ${item.color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <motion.div
                className="text-xl font-bold"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: index * 0.1 + 0.2 }}
              >
                {formatNumber(value)}
              </motion.div>
              <div className="text-xs text-muted-foreground">{item.label}</div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
