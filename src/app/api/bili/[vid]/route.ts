import { NextRequest, NextResponse } from "next/server";
import { getPageCidMap, getPlayUrl } from "@/lib/bilibili";

// TTL-based in-memory cache
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const urlCache = new Map<string, CacheEntry<string>>();
const cidCache = new Map<string, CacheEntry<Map<number, number>>>();

const URL_TTL = 120_000; // 2 min (B站 URL 有效期 120 min, 但保守缓存)
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
  if (cache.size > 5000) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
}

async function resolveCid(vid: string, page: number): Promise<number | string> {
  const cached = getCached(cidCache, vid);
  if (cached) {
    const cid = cached.get(page);
    if (cid) return cid;
    return `分P ${page} 不存在（共 ${cached.size} P）`;
  }

  const result = await getPageCidMap(vid);
  if ("error" in result) return result.error;

  setCache(cidCache, vid, result, CID_TTL);

  const cid = result.get(page);
  if (!cid) return `分P ${page} 不存在（共 ${result.size} P）`;
  return cid;
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
        "Cache-Control": "no-cache",
        "Referrer-Policy": "no-referrer",
        "X-Cache": "HIT",
      },
    });
  }

  // Resolve CID
  const cid = await resolveCid(vid, page);
  if (typeof cid === "string") {
    return NextResponse.json({ error: cid }, { status: 502 });
  }

  // Get video stream URL via shared bilibili.ts helper
  const result = await getPlayUrl(vid, cid);
  if ("error" in result) {
    cidCache.delete(vid);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Cache and redirect
  setCache(urlCache, cacheKey, result.url, URL_TTL);
  // Also cache backup URLs for potential fallback
  if (result.backupUrls.length > 0) {
    setCache(urlCache, `${cacheKey}_backup`, result.backupUrls[0], URL_TTL);
  }

  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: result.url,
      "Cache-Control": "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Video-Quality": String(result.quality),
    },
  });
}
