import { unlink, writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireTestDatabaseUrl } from "../../src/db/safety";
import { retireWorker } from "../../src/server/retire-worker";

const id = `browser-${nanoid(8).toLowerCase()}`;
const password = "browser-fixture-password";
let db: typeof import("../../src/db").db;
let pool: typeof import("../../src/db").pool;

test.beforeAll(async () => {
  if (requireTestDatabaseUrl(process.env.TEST_DATABASE_URL) !== process.env.DATABASE_URL) {
    throw new Error("浏览器回归只能使用专用测试数据库");
  }
  ({ db, pool } = await import("../../src/db"));
  const { user, authAccount, video } = await import("../../src/db/schema");
  const origin = process.env.APP_URL || "http://127.0.0.1:31270";
  await db.insert(user).values({
    id,
    username: id,
    email: `${id}@example.test`,
    name: "浏览器夹具",
    nickname: "浏览器夹具",
  });
  await db.insert(authAccount).values({
    userId: id,
    accountId: id,
    providerId: "credential",
    password: await bcrypt.hash(password, 4),
  });
  await db.insert(video).values(
    ["mp4", "m3u8"].map((format) => ({
      id: `${id}-${format}`,
      title: `浏览器播放夹具 ${format}`,
      uploaderId: id,
      status: "PUBLISHED" as const,
      videoUrl: `${origin}/uploads/browser-smoke/fixture.${format}`,
      subtitleUrl: `${origin}/uploads/browser-smoke/fixture.vtt`,
      danmakuUrl: `${origin}/uploads/browser-smoke/fixture.json`,
    })),
  );
  await db.insert(video).values({
    id: `${id}-youtube`,
    title: "受控嵌入事件夹具",
    uploaderId: id,
    status: "PUBLISHED",
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  await db.insert(video).values([
    {
      id: `${id}-flash`,
      title: "Flash 隔离夹具",
      uploaderId: id,
      status: "PUBLISHED",
      contentType: "FLASH",
      videoUrl: "/uploads/browser-smoke/security.swf",
    },
    {
      id: `${id}-relative`,
      title: "相对媒体地址夹具",
      uploaderId: id,
      status: "PUBLISHED",
      videoUrl: "/api/bili/BV1xx411c7mD",
      coverUrl: "/uploads/browser-smoke/cover.avif",
      subtitleUrl: "/uploads/browser-smoke/fixture.vtt",
      danmakuUrl: "/uploads/browser-smoke/fixture.json",
    },
  ]);
});

test.afterAll(async () => {
  if (db) {
    const { user } = await import("../../src/db/schema");
    await db.delete(user).where(eq(user.id, id));
    await pool.end();
  }
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`${viewport.width}px 页面水合、媒体播放、字幕、切源与导航`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat|Minified React error/i.test(message.text()))
        errors.push(message.text());
    });
    await page.goto("/?sort=latest");
    await expect(page.locator(`a[href="/video/${id}-mp4"]`).first()).toBeVisible();
    await page.locator(`a[href="/video/${id}-mp4"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/video/${id}-mp4$`));
    const media = page.locator("video");
    await expect(media).toHaveCount(1);
    await expect
      .poll(() => media.evaluate((element) => (element as HTMLVideoElement).readyState))
      .toBeGreaterThanOrEqual(2);
    await page
      .locator("[data-controls] button:has(svg.lucide-play)")
      .first()
      .click({ force: true });
    await expect
      .poll(() => media.evaluate((element) => (element as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0.2);
    await expect(page.getByText("浏览器字幕夹具", { exact: true })).toBeVisible();
    await media.evaluate((element) => {
      (element as HTMLVideoElement).currentTime = 3;
    });
    await expect
      .poll(() => media.evaluate((element) => (element as HTMLVideoElement).currentTime))
      .toBeGreaterThanOrEqual(3);
    await page.goto(`/video/${id}-m3u8`);
    await expect(page.locator("video")).toHaveCount(1);
    await expect
      .poll(() =>
        page.locator("video").evaluate((element) => (element as HTMLVideoElement).readyState),
      )
      .toBeGreaterThanOrEqual(2);
    await page
      .locator("[data-controls] button:has(svg.lucide-play)")
      .first()
      .click({ force: true });
    await expect
      .poll(() =>
        page.locator("video").evaluate((element) => (element as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.2);
    await page.goto("/tags");
    await expect(page.locator("video")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(() =>
        navigator.serviceWorker.getRegistrations().then((entries) => entries.length),
      ),
    ).toBe(0);
  });
}

async function login(page: Page) {
  const challengeResponse = page.waitForResponse((response) =>
    response.url().includes("/api/captcha"),
  );
  await page.goto("/login?callbackUrl=%2Fsettings%2Faccount");
  const svg = await (await challengeResponse).text();
  const match = svg.match(/>(\d+) ([+×-]) (\d+) = \?</);
  if (!match) throw new Error("验证码夹具无法解析");
  const first = Number(match[1]);
  const second = Number(match[3]);
  const answer =
    match[2] === "+" ? first + second : match[2] === "-" ? first - second : first * second;
  await page.getByPlaceholder("邮箱或用户名").fill(id);
  await page.getByPlaceholder("******").fill(password);
  await page.getByPlaceholder("计算结果").fill(String(answer));
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
  await expect(page.getByRole("heading", { name: "账号安全", exact: true })).toBeVisible();
}

test("真实登录表单消费验证码、进入受保护页面并上传字幕", async ({ page }) => {
  await login(page);
  const content = "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n上传卷写入夹具\n";
  const response = await page.request.post("/api/upload", {
    multipart: {
      type: "subtitle",
      file: { name: "fixture.vtt", mimeType: "text/vtt", buffer: Buffer.from(content) },
    },
  });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.success).toBe(true);
  const uploaded = await page.request.get(result.url);
  expect(uploaded.status()).toBe(200);
  expect(uploaded.headers()["content-type"]).toContain("text/vtt");
  expect(await uploaded.text()).toBe(content);
});

test("嵌入适配器只发metadata时也能解除骨架并响应播放", async ({ page }) => {
  // 使用当前官方适配器和受控SDK，只验证事件契约，不声称第三方真实播放通过。
  await page.route("https://**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>controlled iframe</title>",
    }),
  );
  await page.addInitScript(() => {
    class FixturePlayer {
      state = 2;
      time = 0;
      listeners = new Map<string, (event: { data: number }) => void>();
      constructor(_target: unknown, options: { events: { onReady: () => void } }) {
        setTimeout(() => options.events.onReady(), 0);
      }
      addEventListener(name: string, callback: (event: { data: number }) => void) {
        this.listeners.set(name, callback);
      }
      emit(state: number) {
        this.state = state;
        this.listeners.get("onStateChange")?.({ data: state });
      }
      getDuration() {
        return 60;
      }
      getCurrentTime() {
        if (this.state === 1) this.time += 0.25;
        return this.time;
      }
      getPlayerState() {
        return this.state;
      }
      getVideoLoadedFraction() {
        return 1;
      }
      getVolume() {
        return 70;
      }
      isMuted() {
        return false;
      }
      getPlaybackRate() {
        return 1;
      }
      getOptions() {
        return [];
      }
      getOption() {
        return [];
      }
      setVolume() {}
      setPlaybackRate() {}
      mute() {}
      unMute() {}
      destroy() {}
      playVideo() {
        this.emit(1);
      }
      pauseVideo() {
        this.emit(2);
      }
      cueVideoById() {
        this.emit(5);
      }
      loadVideoById() {
        this.emit(1);
      }
      seekTo(value: number) {
        this.time = value;
      }
    }
    Object.assign(window, {
      YT: { Player: FixturePlayer, ready: (callback: () => void) => callback() },
    });
  });
  await page.goto(`/video/${id}-youtube`);
  const player = page.getByRole("application", { name: "视频播放器" });
  await expect(player.locator("iframe")).toHaveCount(1);
  await expect(player.locator(":scope > div").first()).toHaveClass(/pointer-events-none/);
  await page.locator("[data-controls] button:has(svg.lucide-play)").first().click({ force: true });
  await expect(page.locator("[data-controls] button:has(svg.lucide-pause)").first()).toBeVisible();
});

test("旧 Service Worker 退役后注销，仅清理识别的应用缓存", async ({ page }) => {
  const path = "build/client/browser-sw-fixture.js";
  await writeFile(
    path,
    'self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));',
  );
  try {
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/browser-sw-fixture.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const cache = await caches.open("pages");
      await cache.put("/video/retired-worker-fixture", new Response("old-app"));
      await cache.put("/unrelated-app/content", new Response("other-app"));
    });
    await writeFile(path, retireWorker);
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
    await expect
      .poll(() =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
      )
      .toBe(0);
    expect(
      await page.evaluate(async () =>
        Boolean(await (await caches.open("pages")).match("/video/retired-worker-fixture")),
      ),
    ).toBe(false);
    expect(
      await page.evaluate(async () =>
        (await (await caches.open("pages")).match("/unrelated-app/content"))?.text(),
      ),
    ).toBe("other-app");
  } finally {
    await unlink(path).catch(() => {});
  }
});

test("已有 B站与上传相对媒体地址可以只改标题", async ({ page }) => {
  await login(page);
  await page.goto(`/video/edit/${id}-relative`);
  await page.getByPlaceholder("输入视频标题").fill("相对地址只修改标题");
  await page.getByRole("button", { name: "保存更改", exact: true }).click();
  await expect(page).toHaveURL(/\/my-videos$/);
  const { video } = await import("../../src/db/schema");
  const [row] = await db
    .select()
    .from(video)
    .where(eq(video.id, `${id}-relative`));
  expect(row.title).toBe("相对地址只修改标题");
  expect(row.videoUrl).toBe("/api/bili/BV1xx411c7mD");
  expect(row.coverUrl).toBe("/uploads/browser-smoke/cover.avif");
  expect(row.subtitleUrl).toBe("/uploads/browser-smoke/fixture.vtt");
  expect(row.danmakuUrl).toBe("/uploads/browser-smoke/fixture.json");
});

test("Flash SDK 沙箱阻止携带登录 Cookie 写 RPC、读取父页和跳转", async ({ page, context }) => {
  await login(page);
  // 先由真实编辑表单生成一个已认证且成功的写请求，作为攻击的有效载荷。
  await page.goto(`/video/edit/${id}-flash`);
  await page.getByPlaceholder("输入视频标题").fill("Flash 安全基线");
  const writeRequest = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().includes("/api/rpc/video/update"),
  );
  await page.getByRole("button", { name: "保存更改", exact: true }).click();
  const authorized = await writeRequest;
  await expect(page).toHaveURL(/\/my-videos$/);
  expect((await authorized.allHeaders()).cookie).toBeTruthy();
  const rpcUrl = authorized.url();
  const payload = (authorized.postData() || "").replace("Flash 安全基线", "Flash 非法写入");
  expect(payload).toContain("Flash 非法写入");
  const rpcAttempts: string[] = [];
  const swfCookies: string[] = [];
  await page.route("**/uploads/browser-smoke/security.swf", async (route) => {
    swfCookies.push((await route.request().allHeaders()).cookie || "");
    await route.fulfill({
      contentType: "application/x-shockwave-flash",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "controlled-swf",
    });
  });
  await page.route("**/api/rpc/video/update", async (route) => {
    rpcAttempts.push((await route.request().allHeaders()).cookie || "anonymous");
    await route.continue();
  });
  // 用受控恶意 SDK 执行真实浏览器请求，故意绕过运行时 fetch 包装以验证 CSP。
  await page.route("**/ruffle/ruffle.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: `window.RufflePlayer = { newest: () => ({ createPlayer: () => {
      const player = document.createElement('div');
      player.load = async (options) => {
        const swfRead = await (await fetch(options.url)).text() === "controlled-swf";
        const results = { swfRead, attempted: true, cookieBlocked: false, parentBlocked: false, navigationBlocked: false, fetchBlocked: false, xhrBlocked: false };
        try { document.cookie; } catch { results.cookieBlocked = true; }
        try { parent.document.body; } catch { results.parentBlocked = true; }
        try { top.location.href = ${JSON.stringify(rpcUrl)}; } catch { results.navigationBlocked = true; }
        const xhr = new XMLHttpRequest();
        results.xhrBlocked = await new Promise(resolve => {
          xhr.open('POST', ${JSON.stringify(rpcUrl)});
          xhr.withCredentials = true;
          xhr.onerror = () => resolve(true);
          xhr.onload = () => resolve(false);
          xhr.send(${JSON.stringify(payload)});
        });
        // fetch 包装额外阻止带凭据写入，XHR 则直接验证浏览器 CSP。
        try { await fetch(${JSON.stringify(rpcUrl)}, { method: 'POST', credentials: 'include', body: ${JSON.stringify(payload)} }); }
        catch { results.fetchBlocked = true; }
        player.textContent = JSON.stringify(results);
      };
      return player;
    } }) };`,
    }),
  );
  await page.goto(`/video/${id}-flash`);
  const frame = page.frameLocator('iframe[title="Flash 内容沙箱"]');
  await expect(frame.locator("body > div")).toContainText('"attempted":true');
  const results = JSON.parse((await frame.locator("body > div").textContent()) || "{}");
  expect(results).toEqual({
    swfRead: true,
    attempted: true,
    cookieBlocked: true,
    parentBlocked: true,
    navigationBlocked: true,
    fetchBlocked: true,
    xhrBlocked: true,
  });
  expect(rpcAttempts).toEqual([]);
  expect(swfCookies).toEqual([""]);
  expect(context.pages()).toHaveLength(1);
  await expect(page).toHaveURL(new RegExp(`/video/${id}-flash$`));
  const { video } = await import("../../src/db/schema");
  const [row] = await db
    .select()
    .from(video)
    .where(eq(video.id, `${id}-flash`));
  expect(row.title).toBe("Flash 安全基线");
  // 重试替换整个沙箱；旧实例不能在重试后保留执行权限。
  await page.getByTitle("重新加载 (R)").click();
  await expect.poll(() => swfCookies.length).toBe(2);
  await expect(frame.locator("body > div")).toContainText('"attempted":true');
  expect(rpcAttempts).toEqual([]);
});
