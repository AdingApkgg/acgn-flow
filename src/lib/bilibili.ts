/**
 * B站视频ID工具
 * 使用B站官方API获取视频信息
 */

import { createHash } from "crypto";
import { sortDanmakuByTime } from "./perf-utils";

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
      headers: getBilibiliHeaders(),
    });

    const data = await response.json();

    // 即使未登录 (code: -101)，wbi_img 数据仍然可用
    if (!data.data?.wbi_img) {
      throw new Error("获取WBI密钥失败: 响应数据缺少 wbi_img");
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
type BilibiliUserVideoItem = { bvid: string; aid: number; title: string; pic: string };

async function getUserVideosWithLegacyApi(
  mid: number,
  page: number,
  pageSize: number
): Promise<BilibiliUserVideoItem[]> {
  try {
    const query = new URLSearchParams({
      mid: String(mid),
      pn: String(page),
      ps: String(pageSize),
      order: "pubdate",
      tid: "0",
      keyword: "",
    });
    const url = `https://api.bilibili.com/x/space/arc/search?${query.toString()}`;
    const response = await fetch(url, {
      headers: getBilibiliHeaders(`https://space.bilibili.com/${mid}`),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return [];
    }

    const data = await response.json();
    if (data.code !== 0 || !data.data?.list?.vlist) {
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
  } catch {
    return [];
  }
}

export async function getUserVideosWithWbi(
  mid: number,
  page: number = 1,
  pageSize: number = 30
): Promise<BilibiliUserVideoItem[]> {
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
      headers: getBilibiliHeaders(`https://space.bilibili.com/${mid}`),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      // 风控或网关回 HTML 时回退旧接口
      return await getUserVideosWithLegacyApi(mid, page, pageSize);
    }

    const data = await response.json();

    if (data.code !== 0 || !data.data?.list?.vlist) {
      console.error("获取用户视频列表失败:", data.message);
      return await getUserVideosWithLegacyApi(mid, page, pageSize);
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
    return await getUserVideosWithLegacyApi(mid, page, pageSize);
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
      headers: getBilibiliHeaders(),
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
      headers: getBilibiliHeaders(),
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

/**
 * 弹幕数据接口（与播放器兼容）
 */
export interface BilibiliDanmaku {
  /** 弹幕内容 */
  text: string;
  /** 出现时间（秒） - 与播放器 DanmakuItem 兼容 */
  time: number;
  /** 弹幕模式：1-3滚动, 4底部, 5顶部, 6逆向, 7高级 */
  mode: number;
  /** 字体大小 */
  size: number;
  /** 颜色（十六进制字符串，如 #FFFFFF） */
  color: string;
}

/**
 * 从B站获取弹幕（使用分段接口获取完整弹幕）
 * B站分段弹幕接口每段包含6分钟的弹幕，可获取完整弹幕
 * @param cid 视频的 cid
 * @param duration 视频时长（秒），用于计算需要获取多少分段
 * @returns 弹幕数组
 */
export async function getDanmakuByCid(cid: number, duration?: number): Promise<BilibiliDanmaku[]> {
  // 先尝试分段接口获取完整弹幕
  const segmentDanmakus = await getDanmakuBySegments(cid, duration);
  if (segmentDanmakus.length > 0) {
    console.log(`[弹幕] 分段接口获取成功，共 ${segmentDanmakus.length} 条`);
    return segmentDanmakus;
  }
  
  // 回退到传统XML接口
  console.log(`[弹幕] 分段接口失败，回退到XML接口`);
  return getDanmakuByXml(cid);
}

/**
 * 通过分段接口获取弹幕（可获取完整弹幕）
 * 每个分段包含6分钟的弹幕
 */
async function getDanmakuBySegments(cid: number, duration?: number): Promise<BilibiliDanmaku[]> {
  const allDanmakus: BilibiliDanmaku[] = [];
  
  // 每个分段6分钟 = 360秒
  const segmentDuration = 360;
  // 如果没有提供时长，默认获取前10个分段（60分钟）
  const maxSegments = duration ? Math.ceil(duration / segmentDuration) : 10;
  
  for (let segmentIndex = 1; segmentIndex <= maxSegments; segmentIndex++) {
    try {
      const url = `https://api.bilibili.com/x/v2/dm/web/seg.so?type=1&oid=${cid}&segment_index=${segmentIndex}`;
      
      const response = await fetch(url, {
        headers: getBilibiliHeaders(),
      });
      
      if (!response.ok) {
        // 404 表示没有更多分段
        if (response.status === 404) break;
        continue;
      }
      
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) break;
      
      // 解析 protobuf 格式的弹幕
      const danmakus = parseProtobufDanmaku(new Uint8Array(arrayBuffer));
      if (danmakus.length === 0) break;
      
      allDanmakus.push(...danmakus);
      
      // 如果当前分段弹幕为空，说明后面也没有了
      if (danmakus.length === 0) break;
      
      // 短暂延迟避免请求过快
      if (segmentIndex < maxSegments) {
        await new Promise(r => setTimeout(r, 50));
      }
    } catch (error) {
      console.error(`获取分段 ${segmentIndex} 失败:`, error);
      break;
    }
  }
  
  // 使用优化的桶排序
  return sortDanmakuByTime(allDanmakus);
}

// 复用 TextDecoder 实例，避免重复创建（性能优化）
const textDecoder = new TextDecoder("utf-8");

// 预计算颜色表（0-16777215 的常用颜色，减少运行时计算）
const colorCache = new Map<number, string>();
function intToHexColor(value: number): string {
  const cached = colorCache.get(value);
  if (cached) return cached;
  const hex = "#" + (value >>> 0).toString(16).padStart(6, "0").toUpperCase();
  // 只缓存常用颜色（避免内存膨胀）
  if (colorCache.size < 1000) {
    colorCache.set(value, hex);
  }
  return hex;
}

/**
 * 解析 protobuf 格式的弹幕数据（优化版）
 * 使用预分配数组、复用 TextDecoder、避免 slice 操作
 */
function parseProtobufDanmaku(data: Uint8Array): BilibiliDanmaku[] {
  // 预估弹幕数量（每条约 50 字节），预分配数组减少扩容
  const estimatedCount = Math.ceil(data.length / 50);
  const danmakus: BilibiliDanmaku[] = new Array(estimatedCount);
  let danmakuIndex = 0;
  let offset = 0;
  const dataLength = data.length;
  
  while (offset < dataLength) {
    const tag = data[offset++];
    if (offset >= dataLength) break;
    
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;
    
    // field 1 是弹幕列表（length-delimited）
    if (fieldNumber === 1 && wireType === 2) {
      // 内联 varint 读取
      let length = 0;
      let shift = 0;
      while (offset < dataLength) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      
      const danmakuEnd = offset + length;
      if (danmakuEnd > dataLength) break;
      
      // 直接解析弹幕（不使用 slice，传入边界）
      const danmaku = parseSingleDanmakuFast(data, offset, danmakuEnd);
      if (danmaku) {
        danmakus[danmakuIndex++] = danmaku;
      }
      offset = danmakuEnd;
    } else {
      // 跳过其他字段
      offset = skipField(data, offset, wireType);
      if (offset < 0) break;
    }
  }
  
  // 裁剪到实际大小
  danmakus.length = danmakuIndex;
  return danmakus;
}

/**
 * 快速解析单条弹幕（避免 slice，直接使用边界）
 * B站弹幕protobuf格式（DanmakuElem）：
 * - field 2 (varint): progress 出现时间（毫秒）
 * - field 3 (varint): mode 弹幕模式
 * - field 4 (varint): fontsize 字号
 * - field 5 (varint): color 颜色
 * - field 7 (string): content 弹幕内容
 */
function parseSingleDanmakuFast(data: Uint8Array, start: number, end: number): BilibiliDanmaku | null {
  let time = 0;
  let mode = 1;
  let size = 25;
  let color = "#FFFFFF";
  let text = "";
  
  let offset = start;
  
  while (offset < end) {
    const tag = data[offset++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;
    
    if (wireType === 0) {
      // varint - 内联解码
      let value = 0;
      let shift = 0;
      while (offset < end) {
        const byte = data[offset++];
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      
      // 使用 switch 常量折叠优化
      if (fieldNumber === 2) {
        time = value * 0.001; // 乘法比除法快
      } else if (fieldNumber === 3) {
        mode = value;
      } else if (fieldNumber === 4) {
        size = value;
      } else if (fieldNumber === 5) {
        color = intToHexColor(value);
      }
    } else if (wireType === 2) {
      // length-delimited (string)
      let length = 0;
      let shift = 0;
      while (offset < end) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      
      if (fieldNumber === 7 && length > 0) {
        // 使用 subarray 而非 slice（不复制内存）
        text = textDecoder.decode(data.subarray(offset, offset + length));
      }
      offset += length;
    } else if (wireType === 5) {
      offset += 4;
    } else if (wireType === 1) {
      offset += 8;
    } else {
      break;
    }
  }
  
  return text ? { text, time, mode, size, color } : null;
}

/**
 * 跳过 protobuf 字段
 */
function skipField(data: Uint8Array, offset: number, wireType: number): number {
  switch (wireType) {
    case 0: // varint
      while (offset < data.length && (data[offset++] & 0x80) !== 0);
      return offset;
    case 1: // 64-bit
      return offset + 8;
    case 2: // length-delimited
      let length = 0;
      let shift = 0;
      while (offset < data.length) {
        const byte = data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
        shift += 7;
      }
      return offset + length;
    case 5: // 32-bit
      return offset + 4;
    default:
      return -1;
  }
}

/**
 * 从B站获取弹幕（传统XML接口，有数量限制约3000条）
 */
async function getDanmakuByXml(cid: number): Promise<BilibiliDanmaku[]> {
  const url = `https://comment.bilibili.com/${cid}.xml`;
  
  try {
    const response = await fetch(url, {
      headers: {
        ...getBilibiliHeaders(),
        "Accept-Encoding": "gzip, deflate",
      },
    });
    
    if (!response.ok) {
      console.error(`获取弹幕失败: HTTP ${response.status}`);
      return [];
    }
    
    const contentEncoding = response.headers.get("content-encoding");
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let xml: string;
    
    // B站弹幕服务器返回 deflate 压缩，需要手动解压
    if (contentEncoding === "deflate") {
      const { inflateRawSync } = await import("zlib");
      try {
        xml = inflateRawSync(buffer).toString("utf-8");
      } catch {
        // 如果 inflateRaw 失败，尝试 inflate（带 zlib header）
        const { inflateSync } = await import("zlib");
        try {
          xml = inflateSync(buffer).toString("utf-8");
        } catch {
          xml = buffer.toString("utf-8");
        }
      }
    } else if (contentEncoding === "gzip") {
      const { gunzipSync } = await import("zlib");
      xml = gunzipSync(buffer).toString("utf-8");
    } else {
      xml = buffer.toString("utf-8");
    }
    
    // 检查是否成功获取 XML
    if (!xml.includes("<d p=")) {
      console.error("弹幕响应不包含有效数据:", xml.substring(0, 200));
      return [];
    }
    
    return parseDanmakuXml(xml);
  } catch (error) {
    console.error("获取弹幕失败:", error);
    return [];
  }
}

/**
 * 解析B站弹幕XML
 * XML格式: <d p="时间,模式,字号,颜色,发送时间戳,弹幕池,用户哈希,弹幕ID">内容</d>
 */
export function parseDanmakuXml(xml: string): BilibiliDanmaku[] {
  const danmakus: BilibiliDanmaku[] = [];
  
  // 匹配所有 <d p="...">...</d> 标签
  const regex = /<d p="([^"]+)">([^<]*)<\/d>/g;
  let match;
  
  while ((match = regex.exec(xml)) !== null) {
    const params = match[1].split(",");
    const text = match[2];
    
    if (params.length >= 4 && text) {
      // 解码 HTML 实体
      const decodedText = text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      
      // 颜色转换为十六进制字符串
      const colorInt = parseInt(params[3], 10) || 16777215;
      const colorHex = `#${colorInt.toString(16).padStart(6, "0").toUpperCase()}`;
      
      danmakus.push({
        text: decodedText,
        time: parseFloat(params[0]) || 0, // 保持秒为单位
        mode: parseInt(params[1], 10) || 1,
        size: parseInt(params[2], 10) || 25,
        color: colorHex,
      });
    }
  }
  
  // 使用优化的桶排序
  return sortDanmakuByTime(danmakus);
}

/**
 * 将弹幕数组转换为JSON格式字符串
 */
export function danmakuToJson(danmakus: BilibiliDanmaku[]): string {
  return JSON.stringify(danmakus);
}

/**
 * 获取视频的cid
 * @param bvid BV号
 * @returns cid 或 null
 */
export async function getVideoCid(bvid: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      { headers: getBilibiliHeaders() }
    );
    
    const data = await response.json();
    
    if (data.code !== 0 || !data.data) {
      return null;
    }
    
    // 返回第一个分P的cid
    return data.data.cid || null;
  } catch {
    return null;
  }
}

/**
 * 获取视频所有分P的cid列表
 * @param bvid BV号
 * @returns cid数组
 */
export async function getVideoPages(bvid: string): Promise<{ cid: number; title: string; page: number }[]> {
  try {
    const response = await fetch(
      `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`,
      { headers: getBilibiliHeaders() }
    );
    
    const data = await response.json();
    
    if (data.code !== 0 || !data.data) {
      return [];
    }
    
    return data.data.map((p: { cid: number; part: string; page: number }) => ({
      cid: p.cid,
      title: p.part,
      page: p.page,
    }));
  } catch {
    return [];
  }
}
