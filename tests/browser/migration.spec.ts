import { unlink, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
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

test("真实登录表单消费验证码、进入受保护页面并上传字幕", async ({ page }) => {
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
