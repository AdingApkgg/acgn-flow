import { Hono } from "hono";
import * as aiPlugin from "./ai-plugin-json";
import appleIcon from "./apple-icon";
import * as bilibiliBatch from "./bilibili-batch";
import * as bilibiliDanmaku from "./bilibili-danmaku";
import * as bilibiliImage from "./bilibili-image";
import * as bilibiliParse from "./bilibili-parse";
import * as bilibiliRandomImage from "./bilibili-random-image";
import { captchaGet, captchaPost } from "./captcha";
import * as emailSendCode from "./email-send-code";
import * as emailVerifyCode from "./email-verify-code";
import * as feed from "./feed";
import icon from "./icon";
import * as indexnow from "./indexnow";
import * as llms from "./llms";
import * as llmsFull from "./llms-full";
import manifest from "./manifest";
import * as openapi from "./openapi-yaml";
import opengraphImage from "./opengraph-image";
import robots from "./robots";
import * as securityTxt from "./security-txt";
import * as sessionInfo from "./session-info";
import * as sitemapStatic from "./sitemap-static";
import * as sitemapTags from "./sitemap-tags";
import * as sitemapUsers from "./sitemap-users";
import * as sitemapVideos from "./sitemap-videos";
import * as upload from "./upload";
import * as uploads from "./uploads";
import videoOpengraphImage from "./video-opengraph-image";

export const httpApp = new Hono();
httpApp.post("/api/upload", (c) => upload.POST(c.req.raw));
httpApp.get("/uploads/*", (c) =>
  uploads.GET(c.req.raw, {
    params: Promise.resolve({
      path: c.req.path.slice("/uploads/".length).split("/").map(decodeURIComponent),
    }),
  }),
);
httpApp.post("/api/bilibili/batch", (c) => bilibiliBatch.POST(c.req.raw));
httpApp.get("/api/bilibili/danmaku", (c) => bilibiliDanmaku.GET(c.req.raw));
httpApp.post("/api/bilibili/danmaku", (c) => bilibiliDanmaku.POST(c.req.raw));
httpApp.get("/api/bilibili/image", (c) => bilibiliImage.GET(c.req.raw));
httpApp.post("/api/bilibili/parse", (c) => bilibiliParse.POST(c.req.raw));
httpApp.get("/api/bilibili/random-image", (c) => bilibiliRandomImage.GET(c.req.raw));
httpApp.get("/api/captcha", captchaGet);
httpApp.post("/api/captcha", captchaPost);
httpApp.post("/api/email/send-code", (c) => emailSendCode.POST(c.req.raw));
httpApp.post("/api/email/verify-code", (c) => emailVerifyCode.POST(c.req.raw));
httpApp.get("/api/indexnow", () => indexnow.GET());
httpApp.post("/api/indexnow", (c) => indexnow.POST(c.req.raw));
httpApp.get("/api/auth/session-info", (c) => sessionInfo.GET(c.req.raw));
httpApp.post("/api/auth/session-info", (c) => sessionInfo.POST(c.req.raw));
httpApp.get("/api/auth/providers", (c) =>
  c.json({
    providers: [
      process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET ? "github" : null,
      process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? "google" : null,
      process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET ? "discord" : null,
    ].filter(Boolean),
  }),
);
httpApp.get("/feed.xml", () => feed.GET());
httpApp.get("/llms.txt", () => llms.GET());
httpApp.get("/llms-full.txt", () => llmsFull.GET());
httpApp.get("/sitemap/static.xml", () => sitemapStatic.GET());
httpApp.get("/sitemap/videos.xml", () => sitemapVideos.GET());
httpApp.get("/sitemap/tags.xml", () => sitemapTags.GET());
httpApp.get("/sitemap/users.xml", () => sitemapUsers.GET());
httpApp.get("/sitemap.xml", (c) => {
  const baseUrl = process.env.APP_URL || new URL(c.req.url).origin;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["static", "videos", "tags", "users"].map((name) => `<sitemap><loc>${baseUrl}/sitemap/${name}.xml</loc></sitemap>`).join("")}</sitemapindex>`;
  return c.body(xml, 200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});
httpApp.get("/robots.txt", (c) => {
  const config = robots();
  const text =
    config.rules
      .map((rule) =>
        [
          `User-agent: ${rule.userAgent}`,
          ...(Array.isArray(rule.allow) ? rule.allow : [rule.allow]).map(
            (path) => `Allow: ${path}`,
          ),
          ...rule.disallow.map((path) => `Disallow: ${path}`),
        ].join("\n"),
      )
      .join("\n\n") + `\n\nSitemap: ${config.sitemap}\nHost: ${config.host}\n`;
  return c.text(text, 200, { "Cache-Control": "public, max-age=3600" });
});
httpApp.get("/manifest.webmanifest", (c) =>
  c.json(manifest(), 200, { "Content-Type": "application/manifest+json" }),
);
httpApp.get("/icon", () => icon());
httpApp.get("/apple-icon", () => appleIcon());
httpApp.get("/favicon.ico", () => icon());
httpApp.get("/opengraph-image", () => opengraphImage());
httpApp.get("/og-image.png", () => opengraphImage());
httpApp.get("/video/:id/opengraph-image", (c) =>
  videoOpengraphImage({ params: Promise.resolve({ id: c.req.param("id") }) }),
);

httpApp.get("/.well-known/openapi.yaml", () => openapi.GET());
httpApp.get("/.well-known/ai-plugin.json", () => aiPlugin.GET());
httpApp.get("/.well-known/security.txt", () => securityTxt.GET());
