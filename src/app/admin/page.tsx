"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Video,
  Tag,
  Eye,
  Heart,
  Star,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toLocaleString();
}

const totalStatItems = [
  { key: "userCount", label: "用户", icon: Users, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  { key: "videoCount", label: "视频", icon: Video, color: "text-green-500", bgColor: "bg-green-500/10" },
  { key: "tagCount", label: "标签", icon: Tag, color: "text-purple-500", bgColor: "bg-purple-500/10" },
  { key: "totalViews", label: "播放量", icon: Eye, color: "text-orange-500", bgColor: "bg-orange-500/10" },
  { key: "likeCount", label: "点赞", icon: Heart, color: "text-red-500", bgColor: "bg-red-500/10" },
  { key: "favoriteCount", label: "收藏", icon: Star, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
] as const;

const growthStatItems = [
  { key: "newUsers", label: "新增用户", icon: Users, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  { key: "newVideos", label: "新增视频", icon: Video, color: "text-green-500", bgColor: "bg-green-500/10" },
  { key: "newTags", label: "新增标签", icon: Tag, color: "text-purple-500", bgColor: "bg-purple-500/10" },
  { key: "newLikes", label: "新增点赞", icon: Heart, color: "text-red-500", bgColor: "bg-red-500/10" },
  { key: "newFavorites", label: "新增收藏", icon: Star, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
] as const;

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
  subtitle,
  index,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  color: string;
  bgColor: string;
  subtitle?: string;
  index: number;
}) {
  return (
    <div>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${bgColor}`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-2xl font-bold">{formatNumber(value)}</div>
              <div className="text-sm text-muted-foreground">{label}</div>
              {subtitle && (
                <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const [trendDays, setTrendDays] = useState(30);

  const { data: totalStats, isLoading: totalLoading } =
    trpc.admin.getPublicStats.useQuery();

  const { data: growthStats, isLoading: growthLoading } =
    trpc.admin.getGrowthStats.useQuery({ days: 30 });

  const { data: trendData, isLoading: trendLoading } =
    trpc.admin.getGrowthTrend.useQuery({ days: trendDays });

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          数据总览
        </h1>
        <p className="text-muted-foreground mt-1">
          查看网站的运营数据和增长趋势。好的网站理应是开放的，您有权利知道这个网站的一切。
        </p>
      </div>

      {/* 加和数据 */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          加和数据
          <span className="text-sm font-normal text-muted-foreground">
            网站建立以来各项指标的总和
          </span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {totalLoading
            ? Array(6)
                .fill(0)
                .map((_, i) => <StatCardSkeleton key={i} />)
            : totalStats &&
              totalStatItems.map((item, index) => (
                <StatCard
                  key={item.key}
                  label={item.label}
                  value={totalStats[item.key]}
                  icon={item.icon}
                  color={item.color}
                  bgColor={item.bgColor}
                  index={index}
                />
              ))}
        </div>
      </section>

      {/* 增量数据 */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          增量数据
          <span className="text-sm font-normal text-muted-foreground">
            最近 30 天新增
          </span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {growthLoading
            ? Array(5)
                .fill(0)
                .map((_, i) => <StatCardSkeleton key={i} />)
            : growthStats &&
              growthStatItems.map((item, index) => (
                <StatCard
                  key={item.key}
                  label={item.label}
                  value={growthStats[item.key]}
                  icon={item.icon}
                  color={item.color}
                  bgColor={item.bgColor}
                  subtitle="最近 30 天"
                  index={index}
                />
              ))}
        </div>
      </section>

      {/* 增量趋势图 */}
      <section>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  增量趋势图
                </CardTitle>
                <CardDescription>
                  用可视化图表展示网站的增量数据状态
                </CardDescription>
              </div>
              <Tabs
                value={trendDays.toString()}
                onValueChange={(v) => setTrendDays(parseInt(v))}
              >
                <TabsList>
                  <TabsTrigger value="7">7天</TabsTrigger>
                  <TabsTrigger value="30">30天</TabsTrigger>
                  <TabsTrigger value="90">90天</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : trendData && trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                    className="text-xs"
                  />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    labelFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString("zh-CN");
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="users"
                    name="新增用户"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="videos"
                    name="新增视频"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                暂无数据
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
