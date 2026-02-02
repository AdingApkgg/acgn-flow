import { NextRequest, NextResponse } from "next/server";
import { parseVideoId, getUserVideosWithWbi } from "@/lib/bilibili";

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
  videoUrl: string;
}

// 获取视频详细信息
async function getVideoDetails(
  bvid: string,
  baseUrl: string
): Promise<Omit<BilibiliVideoInfo, "videoUrl" | "tags"> | null> {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.bilibili.com",
      },
    });

    const data = await response.json();

    if (data.code !== 0 || !data.data) {
      return null;
    }

    const video = data.data;

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
      aid: video.aid,
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
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.bilibili.com",
      },
    });

    const data = await response.json();

    if (data.code !== 0 || !data.data) {
      return [];
    }

    return data.data.map((tag: { tag_name: string }) => tag.tag_name);
  } catch {
    return [];
  }
}

// 获取用户视频列表（使用WBI签名）
async function getUserVideos(
  mid: number,
  page: number = 1,
  pageSize: number = 30
): Promise<{ bvid: string; aid: number; title: string }[]> {
  const videos = await getUserVideosWithWbi(mid, page, pageSize);
  return videos.map((v) => ({
    bvid: v.bvid,
    aid: v.aid,
    title: v.title,
  }));
}

// 获取收藏夹视频列表（自动分页获取全部）
async function getFavoriteVideos(
  mediaId: number
): Promise<{ bvid: string; aid: number; title: string }[]> {
  const allVideos: { bvid: string; aid: number; title: string }[] = [];
  const pageSize = 40; // B站API最大支持40
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const url = `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${mediaId}&pn=${page}&ps=${pageSize}&platform=web`;
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://www.bilibili.com",
        },
      });

      const data = await response.json();

      if (data.code !== 0 || !data.data?.medias) {
        if (page === 1) {
          console.error("获取收藏夹失败:", data.message);
        }
        break;
      }

      const videos = data.data.medias
        .filter((m: { type: number }) => m.type === 2) // 只取视频类型
        .map((m: { bvid: string; id: number; title: string }) => ({
          bvid: m.bvid,
          aid: m.id,
          title: m.title,
        }));

      allVideos.push(...videos);

      // 检查是否还有更多
      hasMore = data.data.has_more || videos.length === pageSize;
      page++;

      // 安全限制，防止无限循环
      if (page > 50) break;
    }

    return allVideos;
  } catch (error) {
    console.error("获取收藏夹失败:", error);
    return allVideos.length > 0 ? allVideos : [];
  }
}

// 获取合集视频列表 (需要mid和season_id)
async function getSeasonVideos(
  mid: number,
  seasonId: number
): Promise<{ bvid: string; aid: number; title: string }[]> {
  const url = `https://api.bilibili.com/x/polymer/web-space/seasons_archives_list?mid=${mid}&season_id=${seasonId}&page_num=1&page_size=100`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.bilibili.com",
      },
    });

    const data = await response.json();

    if (data.code !== 0 || !data.data?.archives) {
      console.error("获取合集失败:", data.message, data.code);
      return [];
    }

    return data.data.archives.map(
      (v: { bvid: string; aid: number; title: string }) => ({
        bvid: v.bvid,
        aid: v.aid,
        title: v.title,
      })
    );
  } catch (error) {
    console.error("获取合集失败:", error);
    return [];
  }
}

// 获取视频分P列表
async function getVideoPages(
  bvid: string
): Promise<{ bvid: string; aid: number; title: string; partTitle: string; cid: number; page: number }[]> {
  try {
    // 先获取视频信息
    const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    const viewResponse = await fetch(viewUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.bilibili.com",
      },
    });
    const viewData = await viewResponse.json();
    
    if (viewData.code !== 0 || !viewData.data) {
      console.error("获取视频信息失败:", viewData.message);
      return [];
    }

    const aid = viewData.data.aid;
    const pages = viewData.data.pages || [];

    if (pages.length <= 1) {
      // 单P视频，返回视频本身
      return [{
        bvid: viewData.data.bvid,
        aid: aid,
        title: viewData.data.title,
        partTitle: viewData.data.title,
        cid: pages[0]?.cid || 0,
        page: 1,
      }];
    }

    // 多P视频，返回所有分P
    return pages.map((p: { cid: number; page: number; part: string }) => ({
      bvid: viewData.data.bvid,
      aid: aid,
      title: `${viewData.data.title} - P${p.page} ${p.part}`,
      partTitle: p.part, // 分P标题
      cid: p.cid,
      page: p.page,
    }));
  } catch (error) {
    console.error("获取分P列表失败:", error);
    return [];
  }
}

// 解析合集/系列URL
function parseCollectionUrl(url: string): { type: "season" | "series"; mid: number; id: number } | null {
  // 新版合集: https://space.bilibili.com/xxx/lists?sid=xxx 或 https://space.bilibili.com/xxx/lists/xxx
  const newListsMatch = url.match(/space\.bilibili\.com\/(\d+)\/lists(?:\?sid=|\/)(\d+)/);
  if (newListsMatch) {
    return { type: "season", mid: parseInt(newListsMatch[1]), id: parseInt(newListsMatch[2]) };
  }

  // 旧版合集: https://space.bilibili.com/xxx/channel/collectiondetail?sid=xxx
  const collectionMatch = url.match(/space\.bilibili\.com\/(\d+)\/channel\/collectiondetail\?sid=(\d+)/);
  if (collectionMatch) {
    return { type: "season", mid: parseInt(collectionMatch[1]), id: parseInt(collectionMatch[2]) };
  }

  // 系列: https://space.bilibili.com/xxx/channel/seriesdetail?sid=xxx
  const seriesMatch = url.match(/space\.bilibili\.com\/(\d+)\/channel\/seriesdetail\?sid=(\d+)/);
  if (seriesMatch) {
    return { type: "series", mid: parseInt(seriesMatch[1]), id: parseInt(seriesMatch[2]) };
  }

  // 视频合集页面: https://www.bilibili.com/video/BVxxx?p=1 (合集形式)
  // 或者直接传入 mid,sid 格式
  const directMatch = url.match(/^(\d+)[,，](\d+)$/);
  if (directMatch) {
    return { type: "season", mid: parseInt(directMatch[1]), id: parseInt(directMatch[2]) };
  }

  return null;
}

// 获取视频系列列表
async function getSeriesVideos(
  mid: number,
  seriesId: number
): Promise<{ bvid: string; aid: number; title: string }[]> {
  const url = `https://api.bilibili.com/x/series/archives?mid=${mid}&series_id=${seriesId}&pn=1&ps=100`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.bilibili.com",
      },
    });

    const data = await response.json();

    if (data.code !== 0 || !data.data?.archives) {
      console.error("获取系列失败:", data.message);
      return [];
    }

    return data.data.archives.map(
      (v: { bvid: string; aid: number; title: string }) => ({
        bvid: v.bvid,
        aid: v.aid,
        title: v.title,
      })
    );
  } catch (error) {
    console.error("获取系列失败:", error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, value, page = 1, pageSize = 20 } = body;

    // 优先使用环境变量，确保线上环境正确
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (() => {
      const protocol = request.headers.get("x-forwarded-proto") || "http";
      const host = request.headers.get("host") || "localhost:3000";
      return `${protocol}://${host}`;
    })();

    let videoList: { bvid: string; aid: number; title: string }[] = [];

    switch (type) {
      case "videos": {
        // 批量视频链接，每行一个
        const urls = (value as string)
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean);
        for (const url of urls.slice(0, 50)) {
          // 限制最多50个
          const parsed = await parseVideoId(url);
          if (parsed) {
            videoList.push({
              bvid: parsed.bvid,
              aid: parsed.aid,
              title: "",
            });
          }
        }
        break;
      }

      case "user": {
        // 用户UID
        const mid = parseInt(value, 10);
        if (isNaN(mid)) {
          return NextResponse.json(
            { error: "无效的用户UID" },
            { status: 400 }
          );
        }
        videoList = await getUserVideos(mid, page, pageSize);
        break;
      }

      case "favorite": {
        // 收藏夹ID
        const mediaId = parseInt(value, 10);
        if (isNaN(mediaId)) {
          return NextResponse.json(
            { error: "无效的收藏夹ID" },
            { status: 400 }
          );
        }
        videoList = await getFavoriteVideos(mediaId);
        break;
      }

      case "season": {
        // 合集 - 支持URL或 mid,sid 格式
        const parsed = parseCollectionUrl(value);
        if (parsed && parsed.type === "season") {
          videoList = await getSeasonVideos(parsed.mid, parsed.id);
        } else {
          // 尝试解析为 mid,sid 格式
          const parts = (value as string).split(/[,，]/);
          if (parts.length === 2) {
            const mid = parseInt(parts[0].trim(), 10);
            const seasonId = parseInt(parts[1].trim(), 10);
            if (!isNaN(mid) && !isNaN(seasonId)) {
              videoList = await getSeasonVideos(mid, seasonId);
            }
          }
        }
        if (videoList.length === 0) {
          return NextResponse.json(
            { error: "无效的合集，请输入格式: 用户UID,合集ID 或粘贴合集页面URL" },
            { status: 400 }
          );
        }
        break;
      }

      case "series": {
        // 系列 - 支持URL或 mid,sid 格式
        const parsed = parseCollectionUrl(value);
        if (parsed && parsed.type === "series") {
          videoList = await getSeriesVideos(parsed.mid, parsed.id);
        } else {
          // 尝试解析为 mid,sid 格式
          const parts = (value as string).split(/[,，]/);
          if (parts.length === 2) {
            const mid = parseInt(parts[0].trim(), 10);
            const seriesId = parseInt(parts[1].trim(), 10);
            if (!isNaN(mid) && !isNaN(seriesId)) {
              videoList = await getSeriesVideos(mid, seriesId);
            }
          }
        }
        if (videoList.length === 0) {
          return NextResponse.json(
            { error: "无效的系列，请输入格式: 用户UID,系列ID 或粘贴系列页面URL" },
            { status: 400 }
          );
        }
        break;
      }

      case "pages": {
        // 视频分P - B站同逻辑，一个视频包含多个分P
        // 返回视频列表，每个分P作为可选项，用户选择要导入的分P
        const parsedVideo = await parseVideoId(value);
        if (!parsedVideo) {
          return NextResponse.json(
            { error: "无效的视频链接" },
            { status: 400 }
          );
        }
        const pages = await getVideoPages(parsedVideo.bvid);
        if (pages.length === 0) {
          return NextResponse.json(
            { error: "获取分P列表失败" },
            { status: 404 }
          );
        }

        // 获取视频基本信息
        const baseDetails = await getVideoDetails(parsedVideo.bvid, baseUrl);
        if (!baseDetails) {
          return NextResponse.json(
            { error: "获取视频信息失败" },
            { status: 404 }
          );
        }

        const tags = await getVideoTags(baseDetails.aid);

        // 返回分P列表供用户选择，但只会创建一个视频
        // 视频URL使用用户选择的分P
        const pageResults = pages.map(p => ({
          title: p.partTitle, // 分P标题
          fullTitle: p.title,
          description: baseDetails.description,
          coverUrl: baseDetails.coverUrl,
          duration: baseDetails.duration,
          uploader: baseDetails.uploader,
          bvid: parsedVideo.bvid,
          aid: baseDetails.aid,
          page: p.page,
          cid: p.cid,
          tags,
          videoUrl: `https://parse.saop.cc/api/bili/${parsedVideo.bvid}?p=${p.page}`,
        }));

        return NextResponse.json({
          success: true,
          total: pageResults.length,
          data: pageResults,
          isPages: true,
          // 返回视频基本信息，用于单个视频导入
          videoInfo: {
            title: baseDetails.title,
            description: baseDetails.description,
            coverUrl: baseDetails.coverUrl,
            duration: baseDetails.duration,
            uploader: baseDetails.uploader,
            bvid: parsedVideo.bvid,
            aid: baseDetails.aid,
            tags,
            totalPages: pages.length,
          },
        });
      }

      default:
        return NextResponse.json(
          { error: "不支持的导入类型" },
          { status: 400 }
        );
    }

    if (videoList.length === 0) {
      return NextResponse.json(
        { error: "未找到任何视频，可能是权限不足或ID错误" },
        { status: 404 }
      );
    }

    // 获取详细信息（限制并发）
    const results: BilibiliVideoInfo[] = [];
    const batchSize = 5;

    for (let i = 0; i < videoList.length; i += batchSize) {
      const batch = videoList.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (v) => {
          const details = await getVideoDetails(v.bvid, baseUrl);
          if (!details) return null;

          const tags = await getVideoTags(details.aid);
          const videoUrl = `https://parse.saop.cc/api/bili/${v.bvid}`;

          return {
            ...details,
            tags,
            videoUrl,
          } as BilibiliVideoInfo;
        })
      );

      results.push(...batchResults.filter((r): r is BilibiliVideoInfo => r !== null));
    }

    return NextResponse.json({
      success: true,
      total: videoList.length,
      data: results,
    });
  } catch (error) {
    console.error("批量获取B站视频失败:", error);
    return NextResponse.json(
      { error: "获取失败，请稍后重试" },
      { status: 500 }
    );
  }
}
