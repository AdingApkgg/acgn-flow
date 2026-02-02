import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitVideosToIndexNow, submitSitePages, submitToIndexNow } from "@/lib/indexnow";
import { submitSitemapToGoogle, isGoogleConfigured } from "@/lib/google-indexing";
import { env } from "@/env";

/**
 * POST /api/indexnow - 手动触发 IndexNow 批量提交
 * 需要管理员权限
 * 
 * Body:
 * - type: "all" | "recent" | "site" | "urls"
 * - days?: number (recent 模式下的天数，默认7)
 * - urls?: string[] (urls 模式下的自定义 URL 列表)
 */
export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "需要登录" }, { status: 401 });
    }

    // 从数据库查询用户角色
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    const body = await request.json();
    const { type = "recent", days = 7, urls } = body;

    const hasIndexNow = !!env.INDEXNOW_KEY;
    const hasGoogle = isGoogleConfigured();

    if (!hasIndexNow && !hasGoogle) {
      return NextResponse.json({ error: "未配置任何搜索引擎推送" }, { status: 400 });
    }

    const results: { indexnow?: { success: number; failed: number } | boolean; google?: boolean } = {};
    const messages: string[] = [];

    // 获取视频 ID 列表
    let videoIds: string[] = [];

    switch (type) {
      case "all": {
        const videos = await prisma.video.findMany({
          where: { status: "PUBLISHED" },
          select: { id: true },
          orderBy: { createdAt: "desc" },
        });
        videoIds = videos.map((v) => v.id);
        break;
      }

      case "recent": {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const videos = await prisma.video.findMany({
          where: {
            status: "PUBLISHED",
            OR: [
              { createdAt: { gte: since } },
              { updatedAt: { gte: since } },
            ],
          },
          select: { id: true },
        });
        videoIds = videos.map((v) => v.id);
        break;
      }

      case "site": {
        // 站点页面
        if (hasIndexNow) {
          results.indexnow = await submitSitePages();
          messages.push(results.indexnow ? "IndexNow: 已提交站点页面" : "IndexNow: 提交失败");
        }
        return NextResponse.json({ success: true, message: messages.join("; "), results });
      }

      case "sitemap": {
        // 提交 sitemap 到 Google
        if (hasGoogle) {
          results.google = await submitSitemapToGoogle();
          messages.push(results.google ? "Google: Sitemap 已提交" : "Google: 提交失败");
        } else {
          return NextResponse.json({ error: "Google Search Console 未配置" }, { status: 400 });
        }
        return NextResponse.json({ success: true, message: messages.join("; "), results });
      }

      case "urls": {
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
          return NextResponse.json({ error: "请提供 urls 数组" }, { status: 400 });
        }
        if (hasIndexNow) {
          results.indexnow = await submitToIndexNow(urls);
          messages.push(results.indexnow ? `IndexNow: 已提交 ${urls.length} 个 URL` : "IndexNow: 提交失败");
        }
        return NextResponse.json({ success: true, message: messages.join("; "), results });
      }

      default:
        return NextResponse.json({ error: "无效的 type 参数" }, { status: 400 });
    }

    // 提交视频到 IndexNow
    if (hasIndexNow) {
      results.indexnow = await submitVideosToIndexNow(videoIds);
      const r = results.indexnow as { success: number };
      messages.push(`IndexNow: ${r.success} 个视频`);
    }

    // 同时通知 Google 更新 sitemap
    if (hasGoogle) {
      results.google = await submitSitemapToGoogle();
      messages.push(results.google ? "Google: Sitemap 已通知" : "Google: 通知失败");
    }

    return NextResponse.json({
      success: true,
      message: messages.join("; "),
      results,
    });
  } catch (error) {
    console.error("IndexNow API 错误:", error);
    return NextResponse.json({ error: "提交失败" }, { status: 500 });
  }
}

/**
 * GET /api/indexnow - 获取搜索引擎推送配置状态
 */
export async function GET() {
  const indexNowConfigured = !!env.INDEXNOW_KEY;
  const googleConfigured = isGoogleConfigured();
  
  return NextResponse.json({
    indexnow: {
      configured: indexNowConfigured,
      keyFile: indexNowConfigured ? `/${env.INDEXNOW_KEY}.txt` : null,
    },
    google: {
      configured: googleConfigured,
      type: "Search Console API (Sitemap)",
      note: googleConfigured ? null : "需配置 GOOGLE_SERVICE_ACCOUNT_EMAIL 和 GOOGLE_PRIVATE_KEY",
    },
  });
}
