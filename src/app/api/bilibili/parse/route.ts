import { NextRequest, NextResponse } from "next/server";
import { parseVideoId } from "@/lib/bilibili";

// B站视频信息接口
interface BilibiliVideoInfo {
  title: string;
  description: string;
  coverUrl: string;
  duration: number;
  tags: string[];
  uploader: string;
  bvid: string;
  aid: number;
  cid?: number; // 用于获取弹幕
  videoUrl: string; // 解析后的视频直链
}

// 获取视频详细信息
async function getVideoDetails(bvid: string, baseUrl: string): Promise<Omit<BilibiliVideoInfo, "videoUrl" | "tags"> | null> {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com",
      },
    });
    
    const data = await response.json();
    
    if (data.code !== 0 || !data.data) {
      console.error("B站API返回错误:", data.message);
      return null;
    }
    
    const video = data.data;
    
    // 使用反代封面URL，确保原始URL使用HTTPS
    let coverPic = video.pic || "";
    if (coverPic.startsWith("http://")) {
      coverPic = coverPic.replace("http://", "https://");
    }
    const proxiedCover = coverPic
      ? `${baseUrl}/api/bilibili/image?url=${encodeURIComponent(coverPic)}`
      : "";
    
    return {
      title: video.title,
      description: video.desc,
      coverUrl: proxiedCover,
      duration: video.duration,
      uploader: video.owner?.name || "",
      bvid: video.bvid,
      aid: video.aid, // 直接使用API返回的AV号
      cid: video.cid || 0, // 用于获取弹幕
    };
  } catch (error) {
    console.error("获取B站视频信息失败:", error);
    return null;
  }
}

// 获取视频标签
async function getVideoTags(aid: number): Promise<string[]> {
  const url = `https://api.bilibili.com/x/tag/archive/tags?aid=${aid}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com",
      },
    });
    
    const data = await response.json();
    
    if (data.code !== 0 || !data.data) {
      return [];
    }
    
    return data.data.map((tag: { tag_name: string }) => tag.tag_name);
  } catch (error) {
    console.error("获取B站视频标签失败:", error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;
    
    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "请提供B站视频链接" },
        { status: 400 }
      );
    }
    
    // 优先使用环境变量，确保线上环境正确
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (() => {
      const protocol = request.headers.get("x-forwarded-proto") || "http";
      const host = request.headers.get("host") || "localhost:3000";
      return `${protocol}://${host}`;
    })();
    
    // 使用B站API解析 BV/AV 号
    const parsed = await parseVideoId(url);
    if (!parsed) {
      return NextResponse.json(
        { error: "无法识别B站视频链接，请输入正确的BV号或AV号" },
        { status: 400 }
      );
    }
    
    const { bvid, aid } = parsed;
    
    // 获取视频详细信息
    const videoInfo = await getVideoDetails(bvid, baseUrl);
    if (!videoInfo) {
      return NextResponse.json(
        { error: "获取视频信息失败，请检查链接是否正确" },
        { status: 404 }
      );
    }
    
    // 获取标签
    const tags = await getVideoTags(aid);
    
    // 使用外部解析服务，以BV号作为参数
    const videoUrl = `https://parse.saop.cc/api/bili/${bvid}`;
    
    return NextResponse.json({
      success: true,
      data: {
        ...videoInfo,
        tags,
        videoUrl,
      },
    });
  } catch (error) {
    console.error("解析B站视频失败:", error);
    return NextResponse.json(
      { error: "解析失败，请稍后重试" },
      { status: 500 }
    );
  }
}
