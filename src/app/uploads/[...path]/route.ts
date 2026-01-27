import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { resolve } from "path";
import { existsSync } from "fs";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    
    // 安全检查：防止路径遍历攻击
    for (const segment of pathSegments) {
      if (segment === ".." || segment.includes("..")) {
        return NextResponse.json({ error: "禁止访问" }, { status: 403 });
      }
    }

    const baseDir = resolve(process.cwd(), UPLOAD_DIR);
    const filePath = resolve(baseDir, ...pathSegments);

    // 确保文件路径在上传目录内
    if (!filePath.startsWith(baseDir)) {
      return NextResponse.json({ error: "禁止访问" }, { status: 403 });
    }

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      return NextResponse.json({ error: "不是文件" }, { status: 400 });
    }

    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileStats.size.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("File serve error:", error);
    return NextResponse.json({ error: "文件读取失败" }, { status: 500 });
  }
}
