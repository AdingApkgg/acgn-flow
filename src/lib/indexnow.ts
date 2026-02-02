import { env } from "@/env";

// IndexNow 支持的搜索引擎端点（去除冗余，api.indexnow.org 会自动分发到所有引擎）
const INDEXNOW_ENDPOINTS = [
  { name: "IndexNow", url: "https://api.indexnow.org/indexnow" }, // 主端点，自动分发到 Bing/Yandex/Seznam/Naver
  { name: "Yandex", url: "https://yandex.com/indexnow" }, // 直接提交确保覆盖
];

// 请求超时时间 (ms)
const REQUEST_TIMEOUT = 5000;

/**
 * 带超时的 fetch
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 提交 URL 到 IndexNow（优化实时性）
 * - 并行提交，5秒超时
 * - 任一端点成功即返回
 * @param urls 要提交的 URL 列表
 */
export async function submitToIndexNow(urls: string | string[]): Promise<boolean> {
  const key = env.INDEXNOW_KEY;

  if (!key) {
    return false; // 静默跳过，不打印日志
  }

  const urlList = Array.isArray(urls) ? urls : [urls];

  if (urlList.length === 0) {
    return false;
  }

  // 从第一个 URL 提取 host
  const firstUrl = new URL(urlList[0]);
  const host = firstUrl.host;

  const payload = JSON.stringify({
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList,
  });

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
  };

  // 使用 Promise.any - 任一成功即返回，全部失败才抛错
  try {
    await Promise.any(
      INDEXNOW_ENDPOINTS.map(async (endpoint) => {
        const response = await fetchWithTimeout(
          endpoint.url,
          { method: "POST", headers, body: payload },
          REQUEST_TIMEOUT
        );

        if (response.ok || response.status === 202) {
          console.log(`IndexNow: ${endpoint.name} 提交成功，${urlList.length} 个 URL`);
          return true;
        }
        throw new Error(`${endpoint.name}: ${response.status}`);
      })
    );
    return true;
  } catch {
    // 所有端点都失败，静默处理
    return false;
  }
}

/**
 * 提交视频页面到 IndexNow
 * @param videoId 视频ID
 */
export async function submitVideoToIndexNow(videoId: string): Promise<boolean> {
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return false;
  
  const videoUrl = `${appUrl}/video/${videoId}`;
  return submitToIndexNow(videoUrl);
}

/**
 * 批量提交视频页面到 IndexNow
 * IndexNow 每次最多提交 10000 个 URL
 * @param videoIds 视频ID列表
 */
export async function submitVideosToIndexNow(videoIds: string[]): Promise<{ success: number; failed: number }> {
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !env.INDEXNOW_KEY) {
    return { success: 0, failed: videoIds.length };
  }

  const urls = videoIds.map((id) => `${appUrl}/video/${id}`);
  
  // IndexNow 限制每次最多 10000 个 URL，分批提交
  const batchSize = 10000;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const result = await submitToIndexNow(batch);
    if (result) {
      success += batch.length;
    } else {
      failed += batch.length;
    }
  }

  return { success, failed };
}

/**
 * 提交首页和其他重要页面
 */
export async function submitSitePages(): Promise<boolean> {
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return false;

  const pages = [
    appUrl,
    `${appUrl}/tags`,
    `${appUrl}/search`,
  ];

  return submitToIndexNow(pages);
}
