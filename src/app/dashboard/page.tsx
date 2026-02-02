"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Video,
  Tag,
  Eye,
  Heart,
  Star,
  TrendingUp,
  BarChart3,
  MessageSquare,
  ArrowUpRight,
  Sparkles,
  Activity,
} from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
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
  { key: "commentCount", label: "评论", icon: MessageSquare, color: "text-cyan-500", bgColor: "bg-cyan-500/10" },
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
  trend,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  color: string;
  bgColor: string;
  subtitle?: string;
  trend?: number;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-card border hover:shadow-sm transition-shadow">
      <div className={`p-2 rounded-lg ${bgColor} shrink-0`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">{formatNumber(value)}</span>
          {trend !== undefined && trend > 0 && (
            <Badge variant="secondary" className="text-green-600 bg-green-100 dark:bg-green-900/30 text-xs px-1.5 py-0">
              <ArrowUpRight className="h-3 w-3" />
              {trend}%
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {label}
          {subtitle && <span className="opacity-70"> · {subtitle}</span>}
        </div>
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-card border">
      <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

// 自定义 Tooltip 样式
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) => {
  if (!active || !payload || !label) return null;
  
  // 解析日期
  let dateStr = label;
  if (typeof label === "string") {
    const parts = label.split("-");
    if (parts.length === 3) {
      dateStr = `${parseInt(parts[1])}月${parseInt(parts[2])}日`;
    }
  }
  
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 min-w-[120px]">
      <div className="text-xs text-muted-foreground mb-2">{dateStr}</div>
      <div className="space-y-1">
        {payload.map((item, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-xs">{item.name}</span>
            </div>
            <span className="text-sm font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const [trendDays, setTrendDays] = useState(30);
  const [chartType, setChartType] = useState<"area" | "bar">("area");

  const { data: totalStats, isLoading: totalLoading } =
    trpc.admin.getPublicStats.useQuery();

  const { data: growthStats, isLoading: growthLoading } =
    trpc.admin.getGrowthStats.useQuery({ days: 30 });

  const { data: trendData, isLoading: trendLoading } =
    trpc.admin.getGrowthTrend.useQuery({ days: trendDays });

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">数据总览</h1>
          <p className="text-muted-foreground text-sm">网站运营数据和增长趋势</p>
        </div>
      </div>

      {/* 统计数据网格 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 累计数据 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              累计数据
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2">
              {totalLoading
                ? Array(7).fill(0).map((_, i) => <StatCardSkeleton key={i} />)
                : totalStats &&
                  totalStatItems.map((item) => (
                    <StatCard
                      key={item.key}
                      label={item.label}
                      value={totalStats[item.key]}
                      icon={item.icon}
                      color={item.color}
                      bgColor={item.bgColor}
                    />
                  ))}
            </div>
          </CardContent>
        </Card>

        {/* 增量数据 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              30 天增量
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2">
              {growthLoading
                ? Array(5).fill(0).map((_, i) => <StatCardSkeleton key={i} />)
                : growthStats &&
                  growthStatItems.map((item) => (
                    <StatCard
                      key={item.key}
                      label={item.label}
                      value={growthStats[item.key]}
                      icon={item.icon}
                      color={item.color}
                      bgColor={item.bgColor}
                    />
                  ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 趋势图 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-muted-foreground" />
              增长趋势
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* 图表类型切换 */}
              <Tabs value={chartType} onValueChange={(v) => setChartType(v as "area" | "bar")}>
                <TabsList className="h-8">
                  <TabsTrigger value="area" className="text-xs px-2 h-6">面积图</TabsTrigger>
                  <TabsTrigger value="bar" className="text-xs px-2 h-6">柱状图</TabsTrigger>
                </TabsList>
              </Tabs>
              {/* 时间范围切换 */}
              <Tabs value={trendDays.toString()} onValueChange={(v) => setTrendDays(parseInt(v))}>
                <TabsList className="h-8">
                  <TabsTrigger value="7" className="text-xs px-2 h-6">7天</TabsTrigger>
                  <TabsTrigger value="30" className="text-xs px-2 h-6">30天</TabsTrigger>
                  <TabsTrigger value="90" className="text-xs px-2 h-6">90天</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {trendLoading ? (
            <Skeleton className="h-[280px] w-full rounded-lg" />
          ) : trendData && trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              {chartType === "area" ? (
                <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradientUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradientVideos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => {
                      const parts = value.split("-");
                      if (parts.length === 3) {
                        return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
                      }
                      return value;
                    }}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    width={35}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="users"
                    name="新增用户"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#gradientUsers)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="videos"
                    name="新增视频"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#gradientVideos)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                  />
                </AreaChart>
              ) : (
                <BarChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => {
                      const parts = value.split("-");
                      if (parts.length === 3) {
                        return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
                      }
                      return value;
                    }}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    width={35}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="users"
                    name="新增用户"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={20}
                  />
                  <Bar
                    dataKey="videos"
                    name="新增视频"
                    fill="#22c55e"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={20}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground">
              暂无数据
            </div>
          )}
          
          {/* 图例 */}
          {trendData && trendData.length > 0 && (
            <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-sm text-muted-foreground">新增用户</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm text-muted-foreground">新增视频</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
