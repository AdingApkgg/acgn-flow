"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";
import { ArtalkComments } from "@/components/comment/artalk-comments";

export default function CommentsPage() {
  const server = process.env.NEXT_PUBLIC_ARTALK_SERVER;
  const site = process.env.NEXT_PUBLIC_ARTALK_SITE;

  if (!server || !site) {
    return (
      <div className="container py-6 max-w-4xl">
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">评论系统未配置</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <MessageCircle className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">留言板</h1>
          <p className="text-sm text-muted-foreground">
            欢迎留下您的想法和建议
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">发表留言</CardTitle>
          <CardDescription>
            分享您对 ACGN Flow 的看法，或者提出功能建议
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ArtalkComments
            pageKey="/comments"
            pageTitle="留言板 - ACGN Flow"
          />
        </CardContent>
      </Card>
    </div>
  );
}
