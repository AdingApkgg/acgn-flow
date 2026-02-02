/**
 * B站视频ID工具
 * 使用B站官方API获取视频信息
 */

import { createHash } from "crypto";

// WBI 签名相关
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

// 缓存 WBI 密钥
let wbiKeysCache: { imgKey: string; subKey: string; timestamp: number } | null = null;
const WBI_CACHE_TTL = 3600 * 1000; // 1小时

/**
 * 获取 WBI 密钥
 */
async function getWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
  // 检查缓存
  if (wbiKeysCache && Date.now() - wbiKeysCache.timestamp < WBI_CACHE_TTL) {
    return { imgKey: wbiKeysCache.imgKey, subKey: wbiKeysCache.subKey };
  }

  try {
    const response = await fetch("https://api.bilibili.com/x/web-interface/nav", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.bilibili.com",
      },
    });

    const data = await response.json();

    if (data.code !== 0) {
      throw new Error("获取WBI密钥失败");
    }

    const { img_url, sub_url } = data.data.wbi_img;
    const imgKey = img_url.split("/").pop()?.split(".")[0] || "";
    const subKey = sub_url.split("/").pop()?.split(".")[0] || "";

    wbiKeysCache = { imgKey, subKey, timestamp: Date.now() };

    return { imgKey, subKey };
  } catch (error) {
    console.error("获取WBI密钥失败:", error);
    throw error;
  }
}

/**
 * 生成混合密钥
 */
function getMixinKey(imgKey: string, subKey: string): string {
  const rawKey = imgKey + subKey;
  return MIXIN_KEY_ENC_TAB.map((n) => rawKey[n]).join("").slice(0, 32);
}

/**
 * 生成 WBI 签名
 */
export async function encWbi(params: Record<string, string | number>): Promise<string> {
  const { imgKey, subKey } = await getWbiKeys();
  const mixinKey = getMixinKey(imgKey, subKey);

  // 添加时间戳
  const wts = Math.floor(Date.now() / 1000);
  const newParams: Record<string, string | number> = { ...params, wts };

  // 按 key 排序
  const sortedKeys = Object.keys(newParams).sort();
  const query = sortedKeys
    .map((key) => {
      const value = String(newParams[key]).replace(/[!'()*]/g, "");
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join("&");

  // 计算 w_rid
  const wRid = createHash("md5").update(query + mixinKey).digest("hex");

  return `${query}&w_rid=${wRid}`;
}

/**
 * 获取用户视频列表（带WBI签名）
 */
export async function getUserVideosWithWbi(
  mid: number,
  page: number = 1,
  pageSize: number = 30
): Promise<{ bvid: string; aid: number; title: string; pic: string }[]> {
  try {
    const params = {
      mid,
      ps: pageSize,
      pn: page,
      order: "pubdate",
    };

    const signedQuery = await encWbi(params);
    const url = `https://api.bilibili.com/x/space/wbi/arc/search?${signedQuery}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: `https://space.bilibili.com/${mid}`,
      },
    });

    const data = await response.json();

    if (data.code !== 0 || !data.data?.list?.vlist) {
      console.error("获取用户视频列表失败:", data.message);
      return [];
    }

    return data.data.list.vlist.map(
      (v: { bvid: string; aid: number; title: string; pic: string }) => ({
        bvid: v.bvid,
        aid: v.aid,
        title: v.title,
        pic: v.pic,
      })
    );
  } catch (error) {
    console.error("获取用户视频列表失败:", error);
    return [];
  }
}

/**
 * 从URL或字符串中提取BV号
 */
export function extractBvid(input: string): string | null {
  // 匹配 BV 号 (BV + 10个字符)
  const bvidMatch = input.match(/BV[a-zA-Z0-9]{10}/i);
  if (bvidMatch) {
    return bvidMatch[0];
  }
  return null;
}

/**
 * 从URL或字符串中提取AV号
 */
export function extractAid(input: string): number | null {
  const aidMatch = input.match(/av(\d+)/i);
  if (aidMatch) {
    return parseInt(aidMatch[1], 10);
  }
  return null;
}

/**
 * 视频信息接口
 */
export interface BilibiliVideoBasicInfo {
  bvid: string;
  aid: number;
  title: string;
  desc: string;
  pic: string;
  duration: number;
  owner: {
    mid: number;
    name: string;
    face: string;
  };
}

/**
 * 通过BV号从B站API获取视频信息
 */
export async function getVideoInfoByBvid(bvid: string): Promise<BilibiliVideoBasicInfo | null> {
  try {
    const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com",
      },
    });
    
    const data = await response.json();
    
    if (data.code !== 0 || !data.data) {
      return null;
    }
    
    return {
      bvid: data.data.bvid,
      aid: data.data.aid,
      title: data.data.title,
      desc: data.data.desc,
      pic: data.data.pic,
      duration: data.data.duration,
      owner: data.data.owner,
    };
  } catch {
    return null;
  }
}

/**
 * 通过AV号从B站API获取视频信息
 */
export async function getVideoInfoByAid(aid: number): Promise<BilibiliVideoBasicInfo | null> {
  try {
    const response = await fetch(`https://api.bilibili.com/x/web-interface/view?aid=${aid}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com",
      },
    });
    
    const data = await response.json();
    
    if (data.code !== 0 || !data.data) {
      return null;
    }
    
    return {
      bvid: data.data.bvid,
      aid: data.data.aid,
      title: data.data.title,
      desc: data.data.desc,
      pic: data.data.pic,
      duration: data.data.duration,
      owner: data.data.owner,
    };
  } catch {
    return null;
  }
}

/**
 * 解析视频ID并获取完整信息
 * @param input 输入字符串，可以是 BV号、AV号、或完整URL
 */
export async function parseVideoId(input: string): Promise<{ bvid: string; aid: number } | null> {
  // 尝试提取 BV 号
  const bvid = extractBvid(input);
  if (bvid) {
    const info = await getVideoInfoByBvid(bvid);
    if (info) {
      return { bvid: info.bvid, aid: info.aid };
    }
  }
  
  // 尝试提取 AV 号
  const aid = extractAid(input);
  if (aid) {
    const info = await getVideoInfoByAid(aid);
    if (info) {
      return { bvid: info.bvid, aid: info.aid };
    }
  }
  
  return null;
}
