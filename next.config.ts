import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack 配置 (Next.js 16 默认使用 Turbopack)
  turbopack: {},
  images: {
    // 禁用图片优化：外部图片服务器网络不稳定会导致超时
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // 优化预加载行为，减少不必要的 CSS 预加载警告
    optimizeCss: true,
  },
};

export default nextConfig;
