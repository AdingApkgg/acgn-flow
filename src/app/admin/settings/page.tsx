"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Construction } from "lucide-react";

export default function AdminSettingsPage() {
  const { data: permissions } = trpc.admin.getMyPermissions.useQuery();

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5" />
            功能开发中
          </CardTitle>
          <CardDescription>
            系统设置功能正在开发中，敬请期待
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            未来将支持以下功能：
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground">
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
