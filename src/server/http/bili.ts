import { getPageCidMap, getPlayUrl } from "@/lib/bilibili";

// 按有效期缓存分P与临时播放地址
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
    // 热门有效项超过上限时淘汰最早写入项。
    while (cache.size > 5000) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
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

export async function GET(_request: Request, { params }: { params: Promise<{ vid: string }> }) {
  const { vid } = await params;
  const url = new URL(_request.url);
  const pageInput = url.searchParams.get("p") ?? "1";
  const page = Number(pageInput);
  if (!/^\d+$/.test(pageInput) || !Number.isSafeInteger(page) || page < 1) {
    return Response.json({ error: "无效的分P序号" }, { status: 400 });
  }

  if (!vid) {
    return Response.json({ error: "请提供视频ID" }, { status: 400 });
  }

  const isAv = /^av[1-9]\d*$/i.test(vid);
  const isBv = /^BV[0-9A-Za-z]{10}$/i.test(vid);

  if (!isAv && !isBv) {
    return Response.json({ error: "视频ID格式错误，需要BV或AV号" }, { status: 400 });
  }

  const cacheKey = `${vid}p=${page}`;

  // 检查临时播放地址缓存
  const cachedUrl = getCached(urlCache, cacheKey);
  if (cachedUrl) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: cachedUrl,
        "Cache-Control": "no-cache",
        "Referrer-Policy": "no-referrer",
        "X-Cache": "HIT",
      },
    });
  }

  // 解析分P对应的 CID
  const cid = await resolveCid(vid, page);
  if (typeof cid === "string") {
    return Response.json({ error: cid }, { status: 502 });
  }

  // 由共享接口获取单文件 MP4 地址
  const result = await getPlayUrl(vid, cid);
  if ("error" in result) {
    cidCache.delete(vid);
    return Response.json({ error: result.error }, { status: 502 });
  }

  // 缓存并重定向
  setCache(urlCache, cacheKey, result.url, URL_TTL);

  return new Response(null, {
    status: 307,
    headers: {
      Location: result.url,
      "Cache-Control": "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Video-Quality": String(result.quality),
    },
  });
}
