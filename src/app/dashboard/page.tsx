"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Settings,
  ArrowRight,
  ArrowUpRight,
  Sparkles,
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
  AreaChart,
  Area,
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
  { key: "userCount", label: "用户", icon: Users, color: "text-blue-500", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/20" },
  { key: "videoCount", label: "视频", icon: Video, color: "text-green-500", bgColor: "bg-green-500/10", borderColor: "border-green-500/20" },
  { key: "tagCount", label: "标签", icon: Tag, color: "text-purple-500", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/20" },
  { key: "commentCount", label: "评论", icon: MessageSquare, color: "text-cyan-500", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/20" },
  { key: "totalViews", label: "播放量", icon: Eye, color: "text-orange-500", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/20" },
  { key: "likeCount", label: "点赞", icon: Heart, color: "text-red-500", bgColor: "bg-red-500/10", borderColor: "border-red-500/20" },
  { key: "favoriteCount", label: "收藏", icon: Star, color: "text-yellow-500", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/20" },
] as const;

// 快捷管理入口
const quickActions = [
  { href: "/dashboard/videos", label: "视频管理", icon: Video, color: "text-green-500", bgColor: "bg-green-500/10", desc: "审核、编辑、删除视频" },
  { href: "/dashboard/users", label: "用户管理", icon: Users, color: "text-blue-500", bgColor: "bg-blue-500/10", desc: "查看用户、分配权限" },
  { href: "/dashboard/comments", label: "评论管理", icon: MessageSquare, color: "text-cyan-500", bgColor: "bg-cyan-500/10", desc: "审核、隐藏、删除评论" },
  { href: "/dashboard/tags", label: "标签管理", icon: Tag, color: "text-purple-500", bgColor: "bg-purple-500/10", desc: "创建、编辑、合并标签" },
  { href: "/dashboard/settings", label: "系统设置", icon: Settings, color: "text-gray-500", bgColor: "bg-gray-500/10", desc: "网站配置、功能开关" },
];

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
  borderColor,
  subtitle,
  trend,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  color: string;
  bgColor: string;
  borderColor?: string;
  subtitle?: string;
  trend?: number;
}) {
  return (
    <Card className={`hover:shadow-lg transition-all duration-300 border-l-4 ${borderColor || "border-l-transparent"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${bgColor}`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">{formatNumber(value)}</div>
              <div className="text-sm text-muted-foreground">{label}</div>
            </div>
          </div>
          {trend !== undefined && trend > 0 && (
            <Badge variant="secondary" className="text-green-600 bg-green-100 dark:bg-green-900/30">
              <ArrowUpRight className="h-3 w-3 mr-0.5" />
              +{trend}%
            </Badge>
          )}
        </div>
        {subtitle && (
          <div className="mt-2 text-xs text-muted-foreground">{subtitle}</div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">数据总览</h1>
            <p className="text-muted-foreground text-sm">
              查看网站的运营数据和增长趋势
            </p>
          </div>
        </div>
      </div>

      {/* 快捷入口 */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">快捷管理</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href}>
                <Card className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer h-full group">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-2">
                      <div className={`p-2 rounded-lg ${action.bgColor} w-fit group-hover:scale-110 transition-transform`}>
                        <Icon className={`h-4 w-4 ${action.color}`} />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{action.label}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{action.desc}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 统计数据 */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">累计数据</h2>
          <span className="text-xs text-muted-foreground">网站建立以来</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {totalLoading
            ? Array(7)
                .fill(0)
                .map((_, i) => <StatCardSkeleton key={i} />)
            : totalStats &&
              totalStatItems.map((item) => (
                <StatCard
                  key={item.key}
                  label={item.label}
                  value={totalStats[item.key]}
                  icon={item.icon}
                  color={item.color}
                  bgColor={item.bgColor}
                  borderColor={item.borderColor}
                />
              ))}
        </div>
      </section>

      {/* 增量数据 */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">增量数据</h2>
          <Badge variant="outline" className="text-xs">最近 30 天</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {growthLoading
            ? Array(5)
                .fill(0)
                .map((_, i) => <StatCardSkeleton key={i} />)
            : growthStats &&
              growthStatItems.map((item) => (
                <StatCard
                  key={item.key}
                  label={item.label}
                  value={growthStats[item.key]}
                  icon={item.icon}
                  color={item.color}
                  bgColor={item.bgColor}
                  subtitle="30 天内新增"
                />
              ))}
        </div>
      </section>

      {/* 趋势图 */}
      <section>
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5" />
                  增长趋势
                </CardTitle>
                <CardDescription>
                  网站用户和内容的增长走势
                </CardDescription>
              </div>
              <Tabs
                value={trendDays.toString()}
                onValueChange={(v) => setTrendDays(parseInt(v))}
              >
                <TabsList className="bg-background">
                  <TabsTrigger value="7">7 天</TabsTrigger>
                  <TabsTrigger value="30">30 天</TabsTrigger>
                  <TabsTrigger value="90">90 天</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {trendLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : trendData && trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorVideos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                    labelFormatter={(value) => {
                      const date = new Date(value);
                      return date.toLocaleDateString("zh-CN", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      });
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="users"
                    name="新增用户"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    fill="url(#colorUsers)"
                  />
                  <Area
                    type="monotone"
                    dataKey="videos"
                    name="新增视频"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    fill="url(#colorVideos)"
                  />
                </AreaChart>
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
