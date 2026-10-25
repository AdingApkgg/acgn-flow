import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireTestDatabaseUrl } from "../src/db/safety";
import * as schema from "../src/db/schema";
import type { httpApp as HttpApp } from "../src/server/http";

// 只在隔离构建机显式开启；全部文件夹具都位于临时目录，不接触真实上传卷。
describe.skipIf(process.env.RUN_HTTP_INTEGRATION !== "1")("Hono 资源与上传边界", () => {
  let app: typeof HttpApp;
  let fixtureRoot: string;
  let uploadRoot: string;
  let previousUploadDirectory: string | undefined;
  const prefix = `http-${nanoid(8)}`;
  const actorIds = ["uploader", "other", "admin", "manager", "banned"].map(
    (name) => `${prefix}-${name}`,
  );
  const videoIds = [`${prefix}-owned`, `${prefix}-other`];
  const cookies = new Map<string, string>();
  let db: typeof import("../src/db").db;

  beforeAll(async () => {
    fixtureRoot = await mkdtemp(join(tmpdir(), "acgn-http-"));
    uploadRoot = join(fixtureRoot, "uploads");
    await mkdir(join(uploadRoot, "subtitle"), { recursive: true });
    await writeFile(
      join(uploadRoot, "subtitle", "fixture.vtt"),
      "WEBVTT\n\n00:00.000 --> 00:01.000\n隔离字幕夹具\n",
    );
    await writeFile(join(fixtureRoot, "private.txt"), "不得通过上传资源读取");
    await symlink(join(fixtureRoot, "private.txt"), join(uploadRoot, "escape.txt"));
    previousUploadDirectory = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = uploadRoot;
    const databaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL);
    if (databaseUrl !== process.env.DATABASE_URL)
      throw new Error("HTTP写入回归只允许专用测试数据库");
    ({ db } = await import("../src/db"));
    ({ httpApp: app } = await import("../src/server/http"));
    await db.insert(schema.user).values(
      actorIds.map((id, index) => ({
        id,
        username: id,
        name: id,
        email: `${id}@example.test`,
        role: index === 2 || index === 3 ? ("ADMIN" as const) : ("USER" as const),
        adminScopes: index === 3 ? ["video:manage"] : [],
        isBanned: index === 4,
      })),
    );
    const password = "http-isolated-fixture-password";
    const passwordHash = await bcrypt.hash(password, 4);
    await db.insert(schema.authAccount).values(
      actorIds.map((id) => ({
        userId: id,
        accountId: id,
        providerId: "credential",
        password: passwordHash,
      })),
    );
    await db.insert(schema.video).values(
      videoIds.map((id, index) => ({
        id,
        title: id,
        videoUrl: "https://example.test/media.mp4",
        uploaderId: actorIds[index] || "",
        status: "PUBLISHED" as const,
      })),
    );
    const { handleAuthRequest } = await import("../src/lib/auth");
    const { redis } = await import("../src/lib/redis");
    for (const actorId of actorIds.slice(0, 4)) {
      const challenge = randomUUID();
      await redis.set(`captcha:challenge:${challenge}`, "3", "EX", 60);
      const origin = process.env.APP_URL || "http://127.0.0.1:31270";
      const response = await handleAuthRequest(
        new Request(`${origin}/api/auth/sign-in/username`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: `acgn-captcha=${challenge}`,
            "x-captcha-answer": "3",
          },
          body: JSON.stringify({ username: actorId, password }),
        }),
      );
      if (response.status !== 200) throw new Error(`HTTP测试身份登录失败: ${response.status}`);
      cookies.set(
        actorId,
        response.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; "),
      );
    }
  });

  afterAll(async () => {
    if (db) await db.delete(schema.user).where(inArray(schema.user.id, actorIds));
    if (previousUploadDirectory === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousUploadDirectory;
    if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
  });

  test("manifest、robots、站点索引和发现资源保留正确内容类型", async () => {
    for (const [path, contentType] of [
      ["/manifest.webmanifest", "application/manifest+json"],
      ["/robots.txt", "text/plain"],
      ["/sitemap.xml", "application/xml"],
      ["/.well-known/openapi.yaml", "text/yaml"],
      ["/.well-known/ai-plugin.json", "application/json"],
      ["/.well-known/security.txt", "text/plain"],
    ] as const) {
      const response = await app.request(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(contentType);
      expect((await response.text()).length).toBeGreaterThan(20);
    }
    const manifest = await (await app.request("/manifest.webmanifest")).json();
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
      "/apple-icon",
      "/icon",
    ]);
    const sitemap = await (await app.request("/sitemap.xml")).text();
    expect(sitemap).toContain("<sitemapindex");
    expect(sitemap.match(/<sitemap>/g)).toHaveLength(4);
  });

  test("本地图标可以独立渲染为 PNG", async () => {
    const response = await app.request("/icon");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  test("匿名上传和会话信息写入被服务端拒绝", async () => {
    for (const path of ["/api/upload", "/api/auth/session-info"]) {
      const response = await app.request(path, { method: "POST" });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "未登录" });
    }
  });

  test("Flash上传保留原内容、相对地址和SWF读取MIME", async () => {
    const content = new Uint8Array([70, 87, 83, 9, 8, 0, 0, 0]);
    const form = new FormData();
    form.set("file", new File([content], "fixture.swf", { type: "application/octet-stream" }));
    form.set("type", "flash");
    const response = await app.request("/api/upload", {
      method: "POST",
      headers: { cookie: cookies.get(actorIds[0] || "") || "" },
      body: form,
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.url).toMatch(/^\/uploads\/flash\/.+\.swf$/);
    expect(result.format).toBe("swf");
    expect(result.compressionMode).toBe("none");
    const downloaded = await app.request(result.url);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get("content-type")).toBe("application/x-shockwave-flash");
    expect(downloaded.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(content);
  });

  test("Flash拒绝错误目录、任意二进制扩展名和超过100MB的文件", async () => {
    const beforeFiles = (await readdir(uploadRoot, { recursive: true })).sort();
    for (const [filename, type] of [
      ["fixture.swf", "../escape"],
      ["fixture.swf", "cover"],
      ["fixture.exe", "flash"],
    ]) {
      const form = new FormData();
      form.set("file", new File(["FWS"], filename, { type: "application/octet-stream" }));
      form.set("type", type || "");
      const response = await app.request("/api/upload", {
        method: "POST",
        headers: { cookie: cookies.get(actorIds[0] || "") || "" },
        body: form,
      });
      expect(response.status).toBe(400);
    }
    // 直接给处理器传入已解析的超限元数据，避免为大小边界分配100MB测试缓冲。
    const oversized = new File(["FWS"], "oversized.swf", { type: "application/x-shockwave-flash" });
    Object.defineProperty(oversized, "size", { value: 100 * 1024 * 1024 + 1 });
    const request = new Request("https://example.test/api/upload", {
      method: "POST",
      headers: { cookie: cookies.get(actorIds[0] || "") || "" },
    });
    Object.defineProperty(request, "formData", {
      value: async () => ({
        get: (name: string) => (name === "file" ? oversized : name === "type" ? "flash" : null),
      }),
    });
    const { POST } = await import("../src/server/http/upload");
    const rejected = await POST(request);
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error).toContain("100MB");
    expect((await readdir(uploadRoot, { recursive: true })).sort()).toEqual(beforeFiles);
  });

  test("字幕保留内容和 MIME，文件缺失返回真实404", async () => {
    const response = await app.request("/uploads/subtitle/fixture.vtt");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/vtt");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toContain("隔离字幕夹具");
    expect((await app.request("/uploads/subtitle/missing.vtt")).status).toBe(404);
  });

  test("编码路径穿越、目录和符号链接无法读取上传目录外文件", async () => {
    for (const path of ["/uploads/%2e%2e%2fprivate.txt", "/uploads/escape.txt"]) {
      const response = await app.request(path);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain("不得通过上传资源读取");
    }
    expect((await app.request("/uploads/subtitle")).status).toBe(400);
  });

  test("验证码只暴露随机挑战标识，最终登录校验只能消费一次", async () => {
    const response = await app.request("/api/captcha");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
    expect(cookie).toMatch(/^acgn-captcha=[0-9a-f-]{36}$/);
    const match = (await response.text()).match(/>(\d+) ([+×-]) (\d+) = \?<\/text>/);
    if (!match) throw new Error("验证码 SVG 未包含受控的数学表达式");
    const first = Number(match[1]);
    const second = Number(match[3]);
    const answer =
      match[2] === "+" ? first + second : match[2] === "-" ? first - second : first * second;
    const { consumeCaptcha } = await import("../src/server/http/captcha");
    const headers = new Headers({ cookie });
    expect(await consumeCaptcha(headers, String(answer))).toBe(true);
    expect(await consumeCaptcha(headers, String(answer))).toBe(false);
  });

  const authHeaders = (actorIndex: number) => ({
    "content-type": "application/json",
    origin: process.env.APP_URL || "http://127.0.0.1:31270",
    cookie: cookies.get(actorIds[actorIndex] || "") || "",
  });

  async function withoutRemoteFetch(action: () => Promise<void>) {
    const blockedFetch: typeof fetch = Object.assign(
      async () => new Response("HTTP安全回归禁止访问外网", { status: 503 }),
      { preconnect: globalThis.fetch.preconnect },
    );
    const network = spyOn(globalThis, "fetch").mockImplementation(blockedFetch);
    try {
      await action();
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  }

  test("匿名保存弹幕在远程解析和文件写入前被拒绝", () =>
    withoutRemoteFetch(async () => {
      expect(
        (await app.request(`/api/bilibili/danmaku?cid=1&save=true&videoId=${videoIds[0]}`)).status,
      ).toBe(401);
      expect(
        (
          await app.request("/api/bilibili/danmaku", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ videos: [{ videoId: videoIds[0], cid: 1 }] }),
          })
        ).status,
      ).toBe(401);
    }));

  test("非所有者、缺管理scope和跨站保存不能触发远程解析", () =>
    withoutRemoteFetch(async () => {
      for (const actorIndex of [1, 2]) {
        const response = await app.request(
          `/api/bilibili/danmaku?cid=1&save=true&videoId=${videoIds[0]}`,
          { headers: authHeaders(actorIndex) },
        );
        expect(response.status).toBe(403);
      }
      const response = await app.request(
        `/api/bilibili/danmaku?cid=1&save=true&videoId=${videoIds[0]}`,
        { headers: { ...authHeaders(0), origin: "https://external.example.test" } },
      );
      expect(response.status).toBe(403);
    }));

  test("已登录账号被封禁后不能保存弹幕", () =>
    withoutRemoteFetch(async () => {
      await db
        .update(schema.user)
        .set({ isBanned: true })
        .where(eq(schema.user.id, actorIds[0] || ""));
      try {
        const response = await app.request(
          `/api/bilibili/danmaku?cid=1&save=true&videoId=${videoIds[0]}`,
          { headers: authHeaders(0) },
        );
        expect(response.status).toBe(401);
      } finally {
        await db
          .update(schema.user)
          .set({ isBanned: false })
          .where(eq(schema.user.id, actorIds[0] || ""));
      }
    }));

  test("保存拒绝路径穿越、伪造来源、缺失视频和整批中的无权目标", () =>
    withoutRemoteFetch(async () => {
      for (const videoId of ["../escaped", "..\\escaped", "/absolute", ".", "..", "bad\u0000id"]) {
        const response = await app.request(
          `/api/bilibili/danmaku?cid=1&save=true&videoId=${encodeURIComponent(videoId)}`,
          { headers: authHeaders(0) },
        );
        expect(response.status).toBe(400);
      }
      expect(
        (await app.request("/api/bilibili/danmaku?bvid=https%3A%2F%2Fexample.test%2Fvideo")).status,
      ).toBe(400);
      expect(
        (
          await app.request(`/api/bilibili/danmaku?cid=1&save=true&videoId=${prefix}-missing`, {
            headers: authHeaders(0),
          })
        ).status,
      ).toBe(404);
      const beforeFiles = await readdir(uploadRoot, { recursive: true });
      const response = await app.request("/api/bilibili/danmaku", {
        method: "POST",
        headers: authHeaders(0),
        body: JSON.stringify({ videos: videoIds.map((videoId) => ({ videoId, cid: 1 })) }),
      });
      expect(response.status).toBe(403);
      expect(await readdir(uploadRoot, { recursive: true })).toEqual(beforeFiles);
    }));

  test("保存使用UPLOAD_DIR与摘要文件名，既有文件符号链接不能越界写入", async () => {
    const { saveDanmaku } = await import("../src/server/http/danmaku-storage");
    const items = [{ text: "受控弹幕夹具", time: 1, mode: 1, size: 25, color: "#ffffff" }];
    const path = await saveDanmaku(videoIds[0] || "", items);
    expect(path).toMatch(/^\/uploads\/danmaku\/[a-f0-9]{64}\.json$/);
    const filename = path.split("/").pop() || "";
    const savedFile = join(uploadRoot, "danmaku", filename);
    expect(await readFile(savedFile, "utf8")).toContain("受控弹幕夹具");
    expect(
      (await db.query.video.findFirst({ where: eq(schema.video.id, videoIds[0] || "") }))
        ?.danmakuUrl,
    ).toBe(path);
    await rm(savedFile);
    await symlink(join(fixtureRoot, "private.txt"), savedFile);
    await saveDanmaku(videoIds[0] || "", items);
    expect(await readFile(join(fixtureRoot, "private.txt"), "utf8")).toBe("不得通过上传资源读取");
    expect(await readFile(savedFile, "utf8")).toContain("受控弹幕夹具");
  });

  test("弹幕目录本身为越界符号链接时拒绝写入", async () => {
    const { saveDanmaku } = await import("../src/server/http/danmaku-storage");
    const directory = join(uploadRoot, "danmaku");
    const backup = join(uploadRoot, "danmaku-verified");
    const outside = join(fixtureRoot, "outside-danmaku");
    await mkdir(outside);
    await rename(directory, backup);
    await symlink(outside, directory);
    try {
      await expect(saveDanmaku(videoIds[0] || "", [])).rejects.toThrow("弹幕目录超出上传目录");
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(directory);
      await rename(backup, directory);
    }
  });

  test("图片代理拒绝伪装为可信域名的来源", async () => {
    const response = await app.request(
      "/api/bilibili/image?url=https%3A%2F%2Fhdslb.com.example.test%2Fimage.png",
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "不支持的图片来源" });
  });

  test("未知资源保持404，交由主应用继续匹配页面", async () => {
    expect((await app.request("/definitely-missing-resource")).status).toBe(404);
  });
});
