import { NextRequest, NextResponse } from "next/server";
import {
  parseVideoId,
  getVideoInfoWbi,
  getVideoTags,
} from "@/lib/bilibili";

interface BilibiliVideoInfo {
  title: string;
  description: string;
  coverUrl: string;
  duration: number;
  tags: string[];
  uploader: string;
  bvid: string;
  aid: number;
  cid?: number;
  videoUrl: string;
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

    const parsed = await parseVideoId(url);
    if (!parsed) {
      return NextResponse.json(
        { error: "无法识别B站视频链接，请输入正确的BV号或AV号" },
        { status: 400 }
      );
    }

    const { bvid, aid } = parsed;

    const info = await getVideoInfoWbi({ bvid });
    if (!info) {
      return NextResponse.json(
        { error: "获取视频信息失败，请检查链接是否正确" },
        { status: 404 }
      );
    }

    let coverPic = info.pic || "";
    if (coverPic.startsWith("http://")) {
      coverPic = coverPic.replace("http://", "https://");
    }
    const proxiedCover = coverPic
      ? `/api/bilibili/image?url=${encodeURIComponent(coverPic)}`
      : "";

    const tags = await getVideoTags(aid);

    const videoUrl = `/api/bili/${bvid}`;

    const data: BilibiliVideoInfo = {
      title: info.title,
      description: info.desc,
      coverUrl: proxiedCover,
      duration: info.duration,
      uploader: info.owner?.name || "",
      bvid: info.bvid,
      aid: info.aid,
      cid: info.cid || 0,
      tags,
      videoUrl,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("解析B站视频失败:", error);
    return NextResponse.json(
      { error: "解析失败，请稍后重试" },
      { status: 500 }
    );
  }
}
