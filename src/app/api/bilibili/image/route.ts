import { NextRequest, NextResponse } from "next/server";

// B站图片反代服务
// 用于绕过B站的防盗链限制

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  
  if (!url) {
    return NextResponse.json(
      { error: "缺少图片URL参数" },
      { status: 400 }
    );
  }
  
  let finalUrl = url;
  
  // 验证是否为B站域名
  try {
    const parsedUrl = new URL(url);
    
    // 强制使用 HTTPS
    if (parsedUrl.protocol === "http:") {
      parsedUrl.protocol = "https:";
      finalUrl = parsedUrl.toString();
    }
    
    // 检查是否为允许的B站域名
    const hostname = parsedUrl.hostname.toLowerCase();
    if (!hostname.includes("hdslb.com") && !hostname.includes("biliimg.com")) {
      return NextResponse.json(
        { error: "不支持的图片来源" },
        { status: 403 }
      );
    }
  } catch (e) {
    console.error("URL解析失败:", e);
    return NextResponse.json(
      { error: "无效的URL" },
      { status: 400 }
    );
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    const response = await fetch(finalUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com/",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error("B站图片请求失败:", response.status, response.statusText);
      return NextResponse.json(
        { error: `获取图片失败: ${response.status}` },
        { status: response.status }
      );
    }
    
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();
    
    if (buffer.byteLength === 0) {
      return NextResponse.json(
        { error: "获取到空图片" },
        { status: 502 }
      );
    }
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("图片代理失败:", error);
    
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "请求超时" },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: "图片代理失败" },
      { status: 500 }
    );
  }
}
