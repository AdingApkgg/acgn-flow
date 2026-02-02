import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";

  // AI 爬虫允许访问的路径
  const aiAllowPaths = ["/", "/video/", "/tag/", "/user/", "/tags", "/search", "/llms.txt", "/llms-full.txt", "/feed.xml"];
  const aiDisallowPaths = ["/api/", "/settings", "/profile", "/upload", "/my-videos", "/favorites", "/history", "/comments", "/video/edit/", "/dashboard/"];

  return {
    rules: [
      // 通用规则
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/settings",
          "/profile",
          "/upload",
          "/my-videos",
          "/favorites",
          "/history",
          "/comments",
          "/video/edit/",
          "/dashboard/",
        ],
      },
      // OpenAI
      {
        userAgent: "GPTBot",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      {
        userAgent: "ChatGPT-User",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      {
        userAgent: "OAI-SearchBot", // OpenAI 搜索爬虫
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      // Google AI
      {
        userAgent: "Google-Extended",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      {
        userAgent: "Googlebot",
        allow: ["/"],
        disallow: aiDisallowPaths,
      },
      // Anthropic (Claude)
      {
        userAgent: "anthropic-ai",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      {
        userAgent: "Claude-Web",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      {
        userAgent: "ClaudeBot",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      // Perplexity
      {
        userAgent: "PerplexityBot",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      // You.com
      {
        userAgent: "YouBot",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      // Brave Search
      {
        userAgent: "Brave-AI",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      // Meta AI
      {
        userAgent: "FacebookBot",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      {
        userAgent: "meta-externalagent",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      // Microsoft/Bing
      {
        userAgent: "Bingbot",
        allow: ["/"],
        disallow: aiDisallowPaths,
      },
      {
        userAgent: "Copilot",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      // ByteDance
      {
        userAgent: "Bytespider",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      // Cohere
      {
        userAgent: "cohere-ai",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      // Apple
      {
        userAgent: "Applebot",
        allow: ["/"],
        disallow: aiDisallowPaths,
      },
      {
        userAgent: "Applebot-Extended",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      // Common Crawl (用于训练数据)
      {
        userAgent: "CCBot",
        allow: aiAllowPaths,
        disallow: aiDisallowPaths,
      },
      // Yandex
      {
        userAgent: "YandexBot",
        allow: ["/"],
        disallow: aiDisallowPaths,
      },
      // Baidu
      {
        userAgent: "Baiduspider",
        allow: ["/"],
        disallow: aiDisallowPaths,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
