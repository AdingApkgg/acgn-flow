import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "../src/db/schema";

// 需要主验证流程先启动隔离预览，仅创建合成业务记录，不使用生产快照。
describe.skipIf(process.env.RUN_ROUTES_INTEGRATION !== "1")("RR8 公开 SSR 与服务端路由保护", () => {
  const baseUrl = process.env.ROUTES_TEST_URL || "http://127.0.0.1:31270";
  const token = `rr8-${nanoid(8)}`;
  const publishedTitle = `公开SSR夹具${token}`;
  const privateTitle = `不可公开草稿${token}`;
  let db: typeof import("../src/db").db;

  beforeAll(async () => {
    ({ db } = await import("../src/db"));
    await db.insert(schema.user).values({
      id: token,
      email: `${token}@example.test`,
      username: token,
      name: "SSR夹具用户",
      nickname: "SSR夹具用户",
    });
    await db.insert(schema.tag).values({ id: token, name: `SSR标签${token}`, slug: token });
    await db.insert(schema.video).values([
      {
        id: token,
        title: publishedTitle,
        description: "服务端输出的视频简介",
        videoUrl: "https://example.test/fixture.mp4",
        uploaderId: token,
        status: "PUBLISHED",
      },
      {
        id: `${token}-private`,
        title: privateTitle,
        videoUrl: "https://example.test/private.mp4",
        uploaderId: token,
        status: "PENDING",
      },
    ]);
    await db.insert(schema.tagOnVideo).values({ tagId: token, videoId: token });
  });

  afterAll(async () => {
    if (db) {
      await db.delete(schema.user).where(eq(schema.user.id, token));
      await db.delete(schema.tag).where(eq(schema.tag.id, token));
    }
  });

  test("首页、搜索、标签和用户页面首次HTML包含真实视频内容", async () => {
    for (const path of [
      `/?sort=latest`,
      `/search?q=${encodeURIComponent(publishedTitle)}`,
      `/tag/${token}`,
      `/user/${token}`,
    ]) {
      const response = await fetch(new URL(path, baseUrl));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain(publishedTitle);
      expect(html).toContain(`/video/${token}`);
      expect(html).toContain('rel="canonical"');
      expect(html).not.toContain(privateTitle);
    }
  });

  test("视频页输出独立SEO和安全JSON-LD", async () => {
    const response = await fetch(new URL(`/video/${token}`, baseUrl));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<title>${publishedTitle}`);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"VideoObject"');
  });

  test("不存在的资源和未发布视频返回真实404", async () => {
    for (const path of [
      `/video/${token}-missing`,
      `/video/${token}-private`,
      `/tag/${token}-missing`,
      `/user/${token}-missing`,
      `/route-${token}-missing`,
    ]) {
      const response = await fetch(new URL(path, baseUrl));
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain(privateTitle);
    }
  });

  test("匿名访问受保护页面在服务器重定向登录并保留回跳地址", async () => {
    for (const path of ["/upload", "/favorites", "/settings/account", "/dashboard/users"]) {
      const response = await fetch(new URL(path, baseUrl), { redirect: "manual" });
      expect(response.status).toBe(302);
      const destination = new URL(response.headers.get("location") || "", baseUrl);
      expect(destination.pathname).toBe("/login");
      expect(destination.searchParams.get("callbackUrl")).toBe(path);
    }
  });
});
