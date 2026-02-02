import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Construction } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CommentsPage() {
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
          <CardTitle className="text-lg flex items-center gap-2">
            <Construction className="h-5 w-5" />
            功能升级中
          </CardTitle>
          <CardDescription>
            留言板功能正在升级，即将上线全新体验
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            您可以在视频页面下方发表评论，与其他用户交流讨论。
          </p>
          <Button asChild>
            <Link href="/">浏览视频</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
