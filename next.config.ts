import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Turbopack 配置 (Next.js 16 默认使用 Turbopack)
  turbopack: {},
  images: {
    unoptimized: true, // 禁用图片优化，直接加载外部图片
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
  },
};

export default nextConfig;
