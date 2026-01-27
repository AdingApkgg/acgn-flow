import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";

  return {
    rules: [
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
          "/video/edit/",
        ],
      },
      {
        userAgent: "GPTBot",
        allow: ["/", "/video/", "/tag/", "/user/"],
        disallow: ["/api/", "/settings", "/profile"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: ["/", "/video/", "/tag/", "/user/"],
        disallow: ["/api/", "/settings", "/profile"],
      },
      {
        userAgent: "Google-Extended",
        allow: ["/", "/video/", "/tag/", "/user/"],
        disallow: ["/api/", "/settings", "/profile"],
      },
      {
        userAgent: "Anthropic-AI",
        allow: ["/", "/video/", "/tag/", "/user/"],
        disallow: ["/api/", "/settings", "/profile"],
      },
      {
        userAgent: "Claude-Web",
        allow: ["/", "/video/", "/tag/", "/user/"],
        disallow: ["/api/", "/settings", "/profile"],
      },
      {
        userAgent: "PerplexityBot",
        allow: ["/", "/video/", "/tag/", "/user/"],
        disallow: ["/api/", "/settings", "/profile"],
      },
      {
        userAgent: "Bytespider",
        allow: ["/", "/video/", "/tag/", "/user/"],
        disallow: ["/api/", "/settings", "/profile"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
