import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user, video } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getDanmakuByCid, getVideoCid } from "@/lib/bilibili";
import { saveDanmaku } from "./danmaku-storage";

const videoIdSchema = z
  .string()
  .min(1)
  .max(191)
  .refine(
    (value) => !/[\\/\0]/.test(value) && value !== "." && value !== "..",
    "视频 ID 不能包含路径分隔符",
  );
const sourceSchema = z.object({
  cid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  bvid: z
    .string()
    .regex(/^BV[A-Za-z0-9]{10}$/, "无效的 B 站视频标识")
    .optional(),
  duration: z.number().nonnegative().max(86400).optional(),
});
const batchSchema = z
  .object({
    videos: z
      .array(
        sourceSchema
          .extend({ videoId: videoIdSchema })
          .strict()
          .refine((input) => input.cid || input.bvid, "请提供 cid 或 bvid"),
      )
      .min(1)
      .max(1000),
  })
  .strict();

class DanmakuError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

function assertSameOrigin(request: Request) {
  const origin = new URL(process.env.APP_URL || request.url).origin;
  const source = request.headers.get("origin") || request.headers.get("referer");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new DanmakuError(403, "禁止跨站保存弹幕");
  if (source) {
    try {
      if (new URL(source).origin !== origin) throw new Error("跨站请求");
    } catch {
      throw new DanmakuError(403, "禁止跨站保存弹幕");
    }
  }
}

// 一次核对整批目标，全部通过前不解析远程数据，也不创建上传目录或写文件。
async function authorizeTargets(request: Request, ids: string[]) {
  assertSameOrigin(request);
  const session = await getSession(request.headers);
  if (!session) throw new DanmakuError(401, "未登录");
  const current = await db.query.user.findFirst({
    where: eq(user.id, session.user.id),
    columns: { id: true, role: true, adminScopes: true, isBanned: true },
  });
  if (!current || current.isBanned) throw new DanmakuError(403, "账号无法保存弹幕");
  const scopes = Array.isArray(current.adminScopes) ? current.adminScopes : [];
  const canManage =
    current.role === "OWNER" || (current.role === "ADMIN" && scopes.includes("video:manage"));
  const uniqueIds = [...new Set(ids)];
  const targets = await db
    .select({ id: video.id, uploaderId: video.uploaderId, status: video.status })
    .from(video)
    .where(inArray(video.id, uniqueIds));
  if (targets.length !== uniqueIds.length || targets.some((target) => target.status === "DELETED"))
    throw new DanmakuError(404, "视频不存在");
  if (targets.some((target) => target.uploaderId !== current.id && !canManage))
    throw new DanmakuError(403, "无权修改该视频的弹幕");
}

function respondError(error: unknown) {
  if (error instanceof DanmakuError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError)
    return Response.json({ error: error.issues[0]?.message || "参数错误" }, { status: 400 });
  console.error("弹幕处理失败:", error);
  return Response.json({ error: "弹幕处理失败" }, { status: 500 });
}

/** 公开读取仅接受可信 B 站标识；保存需要认证与视频管理权限。 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const parsed = sourceSchema
      .extend({
        cid: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
        duration: z.coerce.number().nonnegative().max(86400).optional(),
        save: z.enum(["true", "false"]).optional(),
        videoId: videoIdSchema.optional(),
      })
      .strict()
      .refine((input) => input.cid || input.bvid, "请提供 cid 或 bvid")
      .parse(Object.fromEntries(params));
    if (parsed.save === "true") {
      if (!parsed.videoId) throw new DanmakuError(400, "保存时必须提供视频 ID");
      await authorizeTargets(request, [parsed.videoId]);
    }
    const cid = parsed.cid || (await getVideoCid(parsed.bvid || ""));
    if (!cid) throw new DanmakuError(404, "无法获取视频 cid");
    const danmakus = await getDanmakuByCid(cid, parsed.duration);
    if (!danmakus.length)
      return Response.json({ success: true, count: 0, danmakus: [], message: "该视频没有弹幕" });
    if (parsed.save === "true" && parsed.videoId) {
      const path = await saveDanmaku(parsed.videoId, danmakus);
      return Response.json({ success: true, count: danmakus.length, saved: true, path });
    }
    return Response.json({ success: true, count: danmakus.length, danmakus });
  } catch (error) {
    return respondError(error);
  }
}

/** 批量保存先校验全部输入与全部视频权限，再依次访问 B 站和写入。 */
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new DanmakuError(400, "请求格式错误");
    }
    const { videos } = batchSchema.parse(body);
    await authorizeTargets(
      request,
      videos.map((item) => item.videoId),
    );
    const results: Array<{
      videoId: string;
      success: boolean;
      count?: number;
      path?: string;
      error?: string;
    }> = [];
    for (const item of videos) {
      try {
        const cid = item.cid || (await getVideoCid(item.bvid || ""));
        if (!cid) {
          results.push({ videoId: item.videoId, success: false, error: "无法获取 cid" });
          continue;
        }
        const danmakus = await getDanmakuByCid(cid, item.duration);
        const path = danmakus.length ? await saveDanmaku(item.videoId, danmakus) : undefined;
        results.push({ videoId: item.videoId, success: true, count: danmakus.length, path });
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error("保存弹幕失败:", error);
        results.push({ videoId: item.videoId, success: false, error: "弹幕获取或保存失败" });
      }
    }
    const succeeded = results.filter((item) => item.success).length;
    return Response.json({
      success: true,
      total: videos.length,
      succeeded,
      failed: videos.length - succeeded,
      totalDanmakus: results.reduce((sum, item) => sum + (item.count || 0), 0),
      results,
    });
  } catch (error) {
    return respondError(error);
  }
}
