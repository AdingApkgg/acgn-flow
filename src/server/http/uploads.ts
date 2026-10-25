import { existsSync } from "fs";
import { readFile, realpath, stat } from "fs/promises";
import { resolve, sep } from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

const MIME_TYPES: Record<string, string> = {
  swf: "application/x-shockwave-flash",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  vtt: "text/vtt; charset=utf-8",
  srt: "application/x-subrip; charset=utf-8",
  ass: "text/x-ssa; charset=utf-8",
  ssa: "text/x-ssa; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  json: "application/json; charset=utf-8",
};

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: pathSegments } = await params;

    // 安全检查：防止路径遍历攻击
    for (const segment of pathSegments) {
      if (segment === ".." || segment.includes("..")) {
        return Response.json({ error: "禁止访问" }, { status: 403 });
      }
    }

    const baseDir = resolve(process.cwd(), UPLOAD_DIR);
    const filePath = resolve(baseDir, ...pathSegments);

    // 确保文件路径在上传目录内
    if (!filePath.startsWith(baseDir + sep)) {
      return Response.json({ error: "禁止访问" }, { status: 403 });
    }

    if (!existsSync(filePath)) {
      return Response.json({ error: "文件不存在" }, { status: 404 });
    }

    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      return Response.json({ error: "不是文件" }, { status: 400 });
    }

    const [realBase, realFile] = await Promise.all([realpath(baseDir), realpath(filePath)]);
    if (!realFile.startsWith(realBase + sep))
      return Response.json({ error: "禁止访问" }, { status: 403 });
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const fileBuffer = await readFile(realFile);

    return new Response(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": contentType,
        ...(ext === "swf" ? { "Access-Control-Allow-Origin": "*" } : {}),
        "Content-Length": fileStats.size.toString(),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("File serve error:", error);
    return Response.json({ error: "文件读取失败" }, { status: 500 });
  }
}
