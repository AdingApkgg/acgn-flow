import { NextRequest, NextResponse } from "next/server";

const BILIBILI_COOKIE = process.env.BILIBILI_COOKIE || "";

const HEADERS: Record<string, string> = {
  accept: "application/json, text/plain, */*",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
  "accept-encoding": "gzip",
  "cache-control": "no-cache",
  "X-Real-IP": "120.2.5.6",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
};

if (BILIBILI_COOKIE) {
  HEADERS["cookie"] = BILIBILI_COOKIE;
}

const CID_API = "https://api.bilibili.com/x/player/pagelist";
const PLAYURL_API = "https://api.bilibili.com/x/player/playurl";

// TTL-based in-memory cache
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const urlCache = new Map<string, CacheEntry<string>>();
const cidCache = new Map<string, CacheEntry<Record<string, number>>>();

const URL_TTL = 120_000; // 2 min
const CID_TTL = 3_600_000; // 1 hour

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttl });
  // Lazy eviction: prune expired entries when cache grows large
  if (cache.size > 5000) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
}

async function getCid(vid: string, page: number, isAv: boolean): Promise<number | string> {
  const cachedCids = getCached(cidCache, vid);
  if (cachedCids && String(page) in cachedCids) {
    return cachedCids[String(page)];
  }

  const params = new URLSearchParams(
    isAv ? { aid: vid.slice(2) } : { bvid: vid }
  );

  const resp = await fetch(`${CID_API}?${params}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(8000),
  });

  let json: { code: number; message?: string; data?: Array<{ cid: number; page: number }> };
  try {
    json = await resp.json();
  } catch {
    return "服务器获取CID出错";
  }

  if (json.code !== 0 || !json.data) {
    return `视频状态异常: ${json.message || "未知错误"}`;
  }

  const mapping: Record<string, number> = {};
  for (const p of json.data) {
    mapping[String(p.page)] = p.cid;
  }
  setCache(cidCache, vid, mapping, CID_TTL);

  const cid = mapping[String(page)];
  if (!cid) return `分P ${page} 不存在`;
  return cid;
}

async function getVideoUrl(vid: string, cid: number, isAv: boolean): Promise<string> {
  const params = new URLSearchParams({
    platform: "html5",
    cid: String(cid),
    type: "mp4",
    qn: "208",
    high_quality: "1",
    ...(isAv ? { avid: vid.slice(2) } : { bvid: vid }),
  });

  const resp = await fetch(`${PLAYURL_API}?${params}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(8000),
  });

  let json: { code: number; message?: string; data?: { durl?: Array<{ url: string }> } };
  try {
    json = await resp.json();
  } catch {
    return "服务器获取视频链接出错";
  }

  if (json.code !== 0) {
    return `B站返回错误: ${json.message || "未知错误"}`;
  }

  const url = json.data?.durl?.[0]?.url;
  if (!url) return "未获取到视频流地址";
  return url;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ vid: string }> }
) {
  const { vid } = await params;
  const url = new URL(_request.url);
  const page = parseInt(url.searchParams.get("p") || "1", 10);

  if (!vid) {
    return NextResponse.json({ error: "请提供视频ID" }, { status: 400 });
  }

  const isAv = /^av/i.test(vid);
  const isBv = /^bv/i.test(vid);

  if (!isAv && !isBv) {
    return NextResponse.json({ error: "视频ID格式错误，需要BV或AV号" }, { status: 400 });
  }

  const cacheKey = `${vid}p=${page}`;

  // Check URL cache
  const cachedUrl = getCached(urlCache, cacheKey);
  if (cachedUrl) {
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: cachedUrl,
        "Content-Type": "video/mp4",
        "Cache-Control": "no-cache",
        "Referrer-Policy": "no-referrer",
        "Access-Control-Allow-Origin": "*",
        "X-Cache": "HIT",
      },
    });
  }

  // Resolve CID
  const cid = await getCid(vid, page, isAv);
  if (typeof cid === "string") {
    return NextResponse.json({ error: cid }, { status: 502 });
  }

  // Get video stream URL
  const videoUrl = await getVideoUrl(vid, cid, isAv);
  if (!videoUrl.startsWith("https://")) {
    // Error message returned
    // Clear CID cache in case it was stale
    cidCache.delete(vid);
    return NextResponse.json({ error: videoUrl }, { status: 502 });
  }

  // Cache and redirect
  setCache(urlCache, cacheKey, videoUrl, URL_TTL);

  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: videoUrl,
      "Content-Type": "video/mp4",
      "Cache-Control": "no-cache",
      "Referrer-Policy": "no-referrer",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
