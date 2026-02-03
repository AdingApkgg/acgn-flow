import { NextRequest, NextResponse } from "next/server";
import { getDanmakuByCid, danmakuToJson, getVideoCid } from "@/lib/bilibili";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

/**
 * GET /api/bilibili/danmaku?bvid=xxx 或 ?cid=xxx
 * 获取B站视频弹幕
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bvid = searchParams.get("bvid");
  const cidParam = searchParams.get("cid");
  const save = searchParams.get("save") === "true";
  const videoId = searchParams.get("videoId"); // 本站视频ID，用于保存路径

  let cid: number | null = null;

  // 通过 cid 直接获取
  if (cidParam) {
    cid = parseInt(cidParam, 10);
    if (isNaN(cid)) {
      return NextResponse.json({ error: "无效的 cid" }, { status: 400 });
    }
  }
  // 通过 bvid 获取 cid
  else if (bvid) {
    cid = await getVideoCid(bvid);
    if (!cid) {
      return NextResponse.json({ error: "无法获取视频 cid" }, { status: 404 });
    }
  } else {
    return NextResponse.json({ error: "请提供 bvid 或 cid 参数" }, { status: 400 });
  }

  // 获取弹幕
  const danmakus = await getDanmakuByCid(cid);

  if (danmakus.length === 0) {
    return NextResponse.json({
      success: true,
      count: 0,
      danmakus: [],
      message: "该视频没有弹幕",
    });
  }

  // 如果需要保存到本地
  if (save && videoId) {
    try {
      const uploadsDir = path.join(process.cwd(), "uploads", "danmaku");
      if (!existsSync(uploadsDir)) {
        await mkdir(uploadsDir, { recursive: true });
      }

      const filePath = path.join(uploadsDir, `${videoId}.json`);
      await writeFile(filePath, danmakuToJson(danmakus), "utf-8");

      return NextResponse.json({
        success: true,
        count: danmakus.length,
        saved: true,
        path: `/uploads/danmaku/${videoId}.json`,
      });
    } catch (error) {
      console.error("保存弹幕文件失败:", error);
      return NextResponse.json({
        success: true,
        count: danmakus.length,
        saved: false,
        error: "保存失败",
        danmakus,
      });
    }
  }

  return NextResponse.json({
    success: true,
    count: danmakus.length,
    danmakus,
  });
}

/**
 * POST /api/bilibili/danmaku
 * 批量获取弹幕并保存
 */
export async function POST(request: NextRequest) {
  console.log("[弹幕API] 收到POST请求");
  try {
    const body = await request.json();
    console.log("[弹幕API] 请求体:", JSON.stringify(body).substring(0, 500));
    const { videos } = body as {
      videos: Array<{ videoId: string; cid?: number; bvid?: string; duration?: number }>;
    };

    if (!videos || !Array.isArray(videos)) {
      console.log("[弹幕API] 错误: videos 不是数组");
      return NextResponse.json({ error: "请提供 videos 数组" }, { status: 400 });
    }
    
    console.log("[弹幕API] 处理", videos.length, "个视频");

    const results: Array<{
      videoId: string;
      success: boolean;
      count?: number;
      path?: string;
      error?: string;
    }> = [];

    const uploadsDir = path.join(process.cwd(), "uploads", "danmaku");
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    for (const video of videos) {
      try {
        let cid = video.cid;

        // 如果没有 cid，通过 bvid 获取
        if (!cid && video.bvid) {
          cid = await getVideoCid(video.bvid) ?? undefined;
        }

        if (!cid) {
          results.push({
            videoId: video.videoId,
            success: false,
            error: "无法获取 cid",
          });
          continue;
        }

        // 传递视频时长以获取完整弹幕
        const danmakus = await getDanmakuByCid(cid, video.duration);
        console.log(`[弹幕API] 视频 ${video.videoId} 获取到 ${danmakus.length} 条弹幕`);

        if (danmakus.length === 0) {
          results.push({
            videoId: video.videoId,
            success: true,
            count: 0,
          });
          continue;
        }

        const filePath = path.join(uploadsDir, `${video.videoId}.json`);
        await writeFile(filePath, danmakuToJson(danmakus), "utf-8");

        results.push({
          videoId: video.videoId,
          success: true,
          count: danmakus.length,
          path: `/uploads/danmaku/${video.videoId}.json`,
        });

        // 延迟避免请求过快
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        results.push({
          videoId: video.videoId,
          success: false,
          error: error instanceof Error ? error.message : "未知错误",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const totalDanmakus = results.reduce((sum, r) => sum + (r.count || 0), 0);

    return NextResponse.json({
      success: true,
      total: videos.length,
      succeeded: successCount,
      failed: videos.length - successCount,
      totalDanmakus,
      results,
    });
  } catch (error) {
    console.error("批量获取弹幕失败:", error);
    return NextResponse.json(
      { error: "批量获取弹幕失败" },
      { status: 500 }
    );
  }
}
