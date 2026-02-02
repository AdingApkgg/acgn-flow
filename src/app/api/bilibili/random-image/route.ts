import { NextRequest, NextResponse } from "next/server";

// B站2233娘漫画数据源 (从GitHub动态获取)
const BILIBILI_2233_API =
  "https://raw.githubusercontent.com/iamgqb/bilibili-icons/master/2233.json";

interface BilibiliIcon {
  id: string;
  vid: string;
  name: string;
  data: {
    img: string;
  };
  stime: string;
  etime: string;
}

interface BilibiliIconResponse {
  code: number;
  data: {
    list: BilibiliIcon[];
  };
}

// 缓存图片列表（避免频繁请求GitHub）
let cachedImages: string[] = [];
let validatedImages: string[] = [];
let cacheTime = 0;
const CACHE_TTL = 3600 * 1000; // 1小时缓存

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 验证图片是否有效
async function validateImage(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

// 验证图片列表（并行验证，限制并发）
async function validateImages(urls: string[]): Promise<string[]> {
  const validUrls: string[] = [];
  const batchSize = 10;

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (url) => {
        const isValid = await validateImage(url);
        return { url, isValid };
      })
    );

    for (const result of results) {
      if (result.isValid) {
        validUrls.push(result.url);
      }
    }
  }

  return validUrls;
}

async function fetchImageList(): Promise<string[]> {
  // 检查已验证的缓存
  if (validatedImages.length > 0 && Date.now() - cacheTime < CACHE_TTL) {
    return validatedImages;
  }

  try {
    const response = await fetch(BILIBILI_2233_API, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API请求失败: ${response.status}`);
    }

    const data: BilibiliIconResponse = await response.json();

    if (data.code !== 0 || !data.data?.list?.length) {
      throw new Error("获取图片列表失败");
    }

    // 提取图片URL并转换为完整URL
    const images = data.data.list
      .map((item) => {
        let url = item.data.img;
        // 处理 //开头的URL
        if (url.startsWith("//")) {
          url = `https:${url}`;
        } else if (!url.startsWith("http")) {
          url = `https://${url}`;
        }
        return url;
      })
      .filter((url) => url.includes("hdslb.com"));

    cachedImages = images;

    // 只在首次或缓存过期时验证图片
    if (validatedImages.length === 0 || Date.now() - cacheTime >= CACHE_TTL) {
      console.log(`验证 ${images.length} 张图片...`);
      validatedImages = await validateImages(images);
      console.log(`有效图片: ${validatedImages.length} 张`);
      cacheTime = Date.now();
    }

    return validatedImages;
  } catch (error) {
    console.error("获取2233图片列表失败:", error);
    // 返回缓存（如果有）
    if (validatedImages.length > 0) {
      return validatedImages;
    }
    if (cachedImages.length > 0) {
      return cachedImages;
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const images = await fetchImageList();

    if (images.length === 0) {
      return NextResponse.json({ error: "没有可用的图片" }, { status: 500 });
    }

    // 随机选择一张图片
    const randomIndex = Math.floor(Math.random() * images.length);
    const selectedImage = images[randomIndex];

    // 优先使用环境变量，确保线上环境正确
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (() => {
      const protocol = request.headers.get("x-forwarded-proto") || "http";
      const host = request.headers.get("host") || "localhost:3000";
      return `${protocol}://${host}`;
    })();

    const proxiedUrl = `${baseUrl}/api/bilibili/image?url=${encodeURIComponent(selectedImage)}`;

    return NextResponse.json({
      url: selectedImage,
      proxiedUrl,
      index: randomIndex,
      total: images.length,
    });
  } catch (error) {
    console.error("获取随机图片失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取图片失败" },
      { status: 500 }
    );
  }
}
