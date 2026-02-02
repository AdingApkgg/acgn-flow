"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Settings, Construction, Search, Loader2, CheckCircle, XCircle, Globe, Send } from "lucide-react";
import { toast } from "sonner";

interface SearchEngineStatus {
  indexnow: { configured: boolean; keyFile: string | null };
  google: { configured: boolean; note: string | null };
}

export default function AdminSettingsPage() {
  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();
  const [engineStatus, setEngineStatus] = useState<SearchEngineStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentDays, setRecentDays] = useState(7);
  const [lastResult, setLastResult] = useState<{ type: string; message: string; time: Date } | null>(null);

  useEffect(() => {
    fetch("/api/indexnow")
      .then((res) => res.json())
      .then(setEngineStatus)
      .catch(() => setEngineStatus({
        indexnow: { configured: false, keyFile: null },
        google: { configured: false, note: null },
      }));
  }, []);

  const handleSubmit = async (type: "recent" | "all" | "site" | "sitemap") => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, days: recentDays }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setLastResult({ type, message: data.message, time: new Date() });
      } else {
        toast.error(data.error || "提交失败");
      }
    } catch {
      toast.error("请求失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!permissions?.scopes.includes("settings:manage")) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        您没有系统设置权限
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          系统设置
        </h1>
        <p className="text-muted-foreground mt-1">
          配置网站的系统参数
        </p>
      </div>

      {/* 搜索引擎推送 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            搜索引擎推送
          </CardTitle>
          <CardDescription>
            主动通知搜索引擎索引新内容，加快收录速度
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 配置状态 */}
          <div className="space-y-2">
            <p className="text-sm font-medium">配置状态</p>
            {engineStatus === null ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <div className="flex flex-wrap gap-3">
                {/* IndexNow */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">IndexNow:</span>
                  {engineStatus.indexnow.configured ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      已配置
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      未配置
                    </Badge>
                  )}
                </div>
                {/* Google */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Google:</span>
                  {engineStatus.google.configured ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      已配置
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      未配置
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 自动触发说明 */}
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <p className="font-medium mb-1">自动触发场景：</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>视频发布成功后</li>
              <li>视频信息更新后</li>
              <li>管理员审核通过后</li>
            </ul>
          </div>

          {/* 手动提交 */}
          {(engineStatus?.indexnow.configured || engineStatus?.google.configured) && (
            <div className="space-y-3 pt-2 border-t">
              <p className="text-sm font-medium">手动提交</p>
              
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSubmit("site")}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Globe className="h-4 w-4 mr-1" />}
                  提交站点页面
                </Button>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSubmit("recent")}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                    最近
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={recentDays}
                    onChange={(e) => setRecentDays(parseInt(e.target.value) || 7)}
                    className="w-16 h-8 text-center"
                  />
                  <span className="text-sm text-muted-foreground">天</span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSubmit("all")}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  提交全部视频
                </Button>

                {engineStatus?.google.configured && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSubmit("sitemap")}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Globe className="h-4 w-4 mr-1" />}
                    通知 Google 更新 Sitemap
                  </Button>
                )}
              </div>

              {lastResult && (
                <p className="text-xs text-muted-foreground">
                  上次提交: {lastResult.message} ({lastResult.time.toLocaleTimeString()})
                </p>
              )}
            </div>
          )}

          {!engineStatus?.indexnow.configured && !engineStatus?.google.configured && (
            <div className="text-sm text-muted-foreground space-y-1">
              <p>请在 .env 中配置：</p>
              <ul className="list-disc list-inside text-xs">
                <li>IndexNow: INDEXNOW_KEY + 对应密钥文件</li>
                <li>Google: GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 其他功能开发中 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5" />
            更多功能开发中
          </CardTitle>
          <CardDescription>
            以下功能正在开发中，敬请期待
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>网站基本信息配置（名称、描述、Logo）</li>
            <li>功能开关（注册、评论、上传等）</li>
            <li>存储配置（本地/对象存储）</li>
            <li>邮件服务配置</li>
            <li>第三方登录配置</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
