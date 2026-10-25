import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { video } from "@/db/schema";
import type { BilibiliDanmaku } from "@/lib/bilibili";
import { danmakuToJson } from "@/lib/bilibili";
import { deleteCache } from "@/lib/redis";

// 业务 ID 只参与摘要，不作为文件路径；临时文件原子替换目标，避免跟随既有符号链接。
export async function saveDanmaku(videoId: string, items: BilibiliDanmaku[]) {
  const uploadRoot = resolve(process.env.UPLOAD_DIR || "./uploads");
  await mkdir(uploadRoot, { recursive: true });
  const realRoot = await realpath(uploadRoot);
  const directory = join(realRoot, "danmaku");
  await mkdir(directory, { recursive: true });
  const realDirectory = await realpath(directory);
  if (!realDirectory.startsWith(realRoot + sep)) throw new Error("弹幕目录超出上传目录");
  const filename = `${createHash("sha256").update(videoId).digest("hex")}.json`;
  const temporary = join(realDirectory, `.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, danmakuToJson(items), { encoding: "utf8", flag: "wx" });
    await rename(temporary, join(realDirectory, filename));
  } finally {
    await rm(temporary, { force: true });
  }
  const url = `/uploads/danmaku/${filename}`;
  await db.update(video).set({ danmakuUrl: url }).where(eq(video.id, videoId));
  await deleteCache(`video:${videoId}`);
  return url;
}
