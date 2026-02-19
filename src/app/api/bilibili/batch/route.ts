import { NextRequest, NextResponse } from "next/server";
import { parseVideoId, getUserVideosWithWbi } from "@/lib/bilibili";

// 获取 Bilibili cookie（从环境变量）
const BILIBILI_COOKIE = process.env.BILIBILI_COOKIE || "";

// 通用请求头
function getBilibiliHeaders(referer?: string) {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: referer || "https://www.bilibili.com",
  };
  if (BILIBILI_COOKIE) {
    headers["Cookie"] = BILIBILI_COOKIE;
  }
  return headers;
}

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
  cid?: number; // 用于弹幕获取
  videoUrl: string;
}

// 延迟函数
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 获取视频详细信息
async function getVideoDetails(
  bvid: string,
  baseUrl: string
): Promise<Omit<BilibiliVideoInfo, "videoUrl" | "tags"> | null> {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;

  try {
    const response = await fetch(url, {
      headers: getBilibiliHeaders(),
    });

    // 检查是否返回 HTML（风控页面）
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.error("B站API返回非JSON响应，可能触发风控");
      return null;
    }

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
      cid: video.cid || 0, // 添加 cid 用于弹幕获取
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
      headers: getBilibiliHeaders(),
    });

    // 检查是否返回 HTML（风控页面）
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return [];
    }

    const data = await response.json();

    if (data.code !== 0 || !data.data) {
      return [];
    }

    return data.data.map((tag: { tag_name: string }) => tag.tag_name);
  } catch {
    return [];
  }
}

// 获取用户视频列表（使用WBI签名，控制并发避免风控）
async function getUserVideos(
  mid: number
): Promise<{ bvid: string; aid: number; title: string }[]> {
  const pageSize = 50;
  const allVideos: { bvid: string; aid: number; title: string }[] = [];

  try {
    // 先获取第一页，确定总数
    const firstPage = await getUserVideosWithWbi(mid, 1, pageSize);
    if (firstPage.length === 0) return [];

    allVideos.push(...firstPage.map((v) => ({
      bvid: v.bvid,
      aid: v.aid,
      title: v.title,
    })));

    // 如果第一页就不满，说明没有更多
    if (firstPage.length < pageSize) return allVideos;

    // 分批并行获取（每批3页，避免风控）
    const batchSize = 3;
    let page = 2;
    let hasMore = true;

    while (hasMore && page <= 100) {
      const pagesToFetch = Array.from(
        { length: Math.min(batchSize, 101 - page) },
        (_, i) => page + i
      );

      const pageResults = await Promise.all(
        pagesToFetch.map(async (p) => {
          try {
            return await getUserVideosWithWbi(mid, p, pageSize);
          } catch {
            return [];
          }
        })
      );

      for (const videos of pageResults) {
        if (videos.length === 0) {
          hasMore = false;
          break;
        }
        allVideos.push(...videos.map((v) => ({
          bvid: v.bvid,
          aid: v.aid,
          title: v.title,
        })));
        if (videos.length < pageSize) {
          hasMore = false;
          break;
        }
      }

      page += batchSize;
      
      // 批次间延迟
      if (hasMore) {
        await delay(100);
      }
    }

    return allVideos;
  } catch (error) {
    console.error("获取用户视频列表失败:", error);
    return allVideos.length > 0 ? allVideos : [];
  }
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
        headers: getBilibiliHeaders(),
      });

      const data = await response.json();

      if (data.code !== 0) {
        if (page === 1) {
          // 返回更详细的错误信息
          const errorMsg = data.code === -403 ? "收藏夹不存在或为私密" : data.message;
          console.error("获取收藏夹失败:", errorMsg, `(code: ${data.code})`);
        }
        break;
      }
      
      if (!data.data?.medias) {
        // 空收藏夹
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

// 获取合集视频列表 (需要mid和season_id，支持分页和重试)
async function getSeasonVideos(
  mid: number,
  seasonId: number
): Promise<{ bvid: string; aid: number; title: string }[]> {
  const allVideos: { bvid: string; aid: number; title: string }[] = [];
  const pageSize = 30; // 使用较小的 pageSize 更稳定
  let page = 1;
  let hasMore = true;
  let retryCount = 0;
  const maxRetries = 3;

  while (hasMore && page <= 50) {
    const url = `https://api.bilibili.com/x/polymer/web-space/seasons_archives_list?mid=${mid}&season_id=${seasonId}&page_num=${page}&page_size=${pageSize}`;

    try {
      const response = await fetch(url, {
        headers: getBilibiliHeaders(`https://space.bilibili.com/${mid}`),
      });

      // 检查风控
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        console.error("合集API返回非JSON响应，可能触发风控，重试中...");
        if (retryCount < maxRetries) {
          retryCount++;
          await delay(500 * retryCount); // 递增延迟
          continue;
        }
        break;
      }

      const data = await response.json();

      if (data.code !== 0) {
        console.error("获取合集失败:", data.message, data.code);
        if (retryCount < maxRetries && (data.code === -412 || data.code === -799)) {
          // 风控错误码，重试
          retryCount++;
          await delay(500 * retryCount);
          continue;
        }
        break;
      }

      if (!data.data?.archives || data.data.archives.length === 0) {
        hasMore = false;
        break;
      }

      retryCount = 0; // 重置重试计数
      const videos = data.data.archives.map(
        (v: { bvid: string; aid: number; title: string }) => ({
          bvid: v.bvid,
          aid: v.aid,
          title: v.title,
        })
      );
      allVideos.push(...videos);

      // 检查是否有更多
      hasMore = videos.length === pageSize;
      page++;

      // 分页间延迟
      if (hasMore) {
        await delay(150);
      }
    } catch (error) {
      console.error("获取合集失败:", error);
      if (retryCount < maxRetries) {
        retryCount++;
        await delay(500 * retryCount);
        continue;
      }
      break;
    }
  }

  return allVideos;
}

// 仅通过合集ID获取视频列表（不需要mid）
async function getSeasonVideosById(
  seasonId: number
): Promise<{ bvid: string; aid: number; title: string }[]> {
  // 方法1: 直接通过合集视频列表API
  const url = `https://api.bilibili.com/x/polymer/web-space/season/episodes?season_id=${seasonId}&page_num=1&page_size=100`;

  try {
    const response = await fetch(url, {
      headers: getBilibiliHeaders(),
    });

    // 检查风控
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.error("合集API返回非JSON响应，可能触发风控");
      // 继续尝试备用方法
    } else {
      const data = await response.json();
      if (data.code === 0 && data.data?.archives?.length > 0) {
        return data.data.archives.map(
          (v: { bvid: string; aid: number; title: string }) => ({
            bvid: v.bvid,
            aid: v.aid,
            title: v.title,
          })
        );
      }
    }

    // 备用方法不可靠，提示用户需要提供完整信息
    console.error("获取合集失败（仅ID）: 无法获取合集信息，请提供 用户UID,合集ID 格式");
    return [];
  } catch (error) {
    console.error("获取合集失败（仅ID）:", error);
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
      headers: getBilibiliHeaders(),
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

// 解析用户UID输入（支持纯数字、space链接、uid=xxx、UID:xxx、全角数字）
function parseUserUidInput(value: unknown): number | null {
  if (typeof value !== "string") return null;

  // 将全角数字转为半角，避免中文输入法导致解析失败
  const normalized = value
    .trim()
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  if (!normalized) return null;

  // 1) 纯数字
  if (/^\d+$/.test(normalized)) {
    const uid = Number(normalized);
    return Number.isInteger(uid) && uid > 0 ? uid : null;
  }

  // 2) space主页/视频页链接（支持 http/https，可带后续路径和参数）
  const spaceMatch = normalized.match(/(?:https?:\/\/)?space\.bilibili\.com\/(\d+)/i);
  if (spaceMatch) {
    const uid = Number(spaceMatch[1]);
    return Number.isInteger(uid) && uid > 0 ? uid : null;
  }

  // 3) 通用 uid=xxx / UID:xxx / uid xxx
  const uidMatch = normalized.match(/\buid\b\s*[:=]?\s*(\d+)/i);
  if (uidMatch) {
    const uid = Number(uidMatch[1]);
    return Number.isInteger(uid) && uid > 0 ? uid : null;
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
      headers: getBilibiliHeaders(`https://space.bilibili.com/${mid}`),
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
    const { type, value } = body;

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
        // 用户UID（自动获取全部投稿）
        const mid = parseUserUidInput(value);
        if (!mid) {
          return NextResponse.json(
            { error: "无效的用户UID" },
            { status: 400 }
          );
        }
        videoList = await getUserVideos(mid);
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
        // 合集 - 支持URL、mid,sid 格式或仅合集ID
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
          } else if (parts.length === 1) {
            // 仅合集ID - 尝试通过合集API直接获取
            const seasonId = parseInt(parts[0].trim(), 10);
            if (!isNaN(seasonId)) {
              videoList = await getSeasonVideosById(seasonId);
            }
          }
        }
        if (videoList.length === 0) {
          return NextResponse.json(
            { error: "无效的合集，请粘贴合集页面URL（如 space.bilibili.com/xxx/lists/xxx）或输入 用户UID,合集ID 格式" },
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

    // 获取详细信息（控制并发避免风控）
    const batchSize = 5; // 降低并发数避免触发风控
    const results: BilibiliVideoInfo[] = [];

    for (let i = 0; i < videoList.length; i += batchSize) {
      const batch = videoList.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (v) => {
          try {
            const [details, tags] = await Promise.all([
              getVideoDetails(v.bvid, baseUrl),
              getVideoTags(v.aid),
            ]);
            if (!details) return null;

            return {
              ...details,
              tags,
              videoUrl: `https://parse.saop.cc/api/bili/${v.bvid}`,
            } as BilibiliVideoInfo;
          } catch {
            return null;
          }
        })
      );
      results.push(...batchResults.filter((r): r is BilibiliVideoInfo => r !== null));

      // 批次间添加延迟，避免触发风控
      if (i + batchSize < videoList.length) {
        await delay(200);
      }
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
