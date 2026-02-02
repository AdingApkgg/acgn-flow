import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";
  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";

  let statsSection = "";
  let tagsSection = "";
  let recentVideosSection = "";

  try {
    // 获取统计数据
    const [videoCount, userCount, tagCount] = await Promise.all([
      prisma.video.count({ where: { status: "PUBLISHED" } }),
      prisma.user.count(),
      prisma.tag.count(),
    ]);

    statsSection = `
## 网站统计

- 视频数量: ${videoCount}
- 注册用户: ${userCount}
- 标签数量: ${tagCount}
`;

    // 获取热门标签
    const popularTags = await prisma.tag.findMany({
      orderBy: { videos: { _count: "desc" } },
      take: 20,
      select: { name: true, slug: true, _count: { select: { videos: true } } },
    });

    if (popularTags.length > 0) {
      tagsSection = `
## 热门标签

${popularTags.map((tag) => `- [${tag.name}](${baseUrl}/tag/${tag.slug}) (${tag._count.videos} 个视频)`).join("\n")}
`;
    }

    // 获取最新视频
    const recentVideos = await prisma.video.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        description: true,
        views: true,
        createdAt: true,
        uploader: { select: { nickname: true, username: true } },
      },
    });

    if (recentVideos.length > 0) {
      recentVideosSection = `
## 最新视频

${recentVideos
  .map(
    (video) => `### ${video.title}
- URL: ${baseUrl}/video/${video.id}
- 上传者: ${video.uploader.nickname || video.uploader.username}
- 观看次数: ${video.views}
- 上传时间: ${new Date(video.createdAt).toISOString().split("T")[0]}
${video.description ? `- 简介: ${video.description.slice(0, 200)}${video.description.length > 200 ? "..." : ""}` : ""}
`
  )
  .join("\n")}
`;
    }
  } catch (error) {
    console.warn("llms-full.txt: Database unavailable", error);
  }

  const content = `# ${siteName} - 完整信息

> 本文件提供给 AI 代理和大语言模型更详细的网站信息。

## 关于本站

${siteName} 是一个专注于 ACGN（Anime、Comic、Game、Novel）的流式媒体内容分享平台。

### 平台特点

1. **视频分享**: 用户可以分享动画、漫画、游戏、轻小说相关的视频内容
2. **分类系统**: 通过标签对视频进行分类，方便用户发现感兴趣的内容
3. **用户互动**: 支持点赞、收藏、评论等社交功能
4. **弹幕系统**: 视频播放支持弹幕功能，增强观看体验
5. **响应式设计**: 支持桌面和移动设备访问

### 内容类型

- **动画 (Anime)**: 日本动画、国产动画、欧美动画相关视频
- **漫画 (Comic)**: 漫画解说、漫画推荐、漫画改编相关视频
- **游戏 (Game)**: 游戏实况、游戏评测、游戏攻略相关视频
- **轻小说 (Novel)**: 轻小说推荐、轻小说改编、有声书相关视频
- **VOCALOID**: 虚拟歌手、音乐创作相关视频
- **二次元文化**: Cosplay、同人创作、展会相关视频
${statsSection}${tagsSection}${recentVideosSection}
## 技术栈

本站使用以下技术构建：
- 前端: Next.js 15, React 19, Tailwind CSS, shadcn/ui
- 后端: Node.js, Prisma ORM, PostgreSQL
- 部署: Docker, Nginx

## 数据访问

### 公开数据源

- **RSS Feed**: ${baseUrl}/feed.xml - 最新视频订阅
- **Sitemap**: ${baseUrl}/sitemap.xml - 网站地图
- **OpenAPI**: ${baseUrl}/.well-known/openapi.yaml - API 规范

### 页面结构

- 首页 (${baseUrl}): 展示最新和热门视频
- 视频页 (${baseUrl}/video/{id}): 单个视频详情
- 标签页 (${baseUrl}/tag/{slug}): 按标签浏览视频
- 用户页 (${baseUrl}/user/{id}): 用户主页和上传视频
- 搜索页 (${baseUrl}/search?q={query}): 搜索视频

## 使用指南

### 对于 AI 代理

1. 使用 sitemap.xml 发现所有公开页面
2. 使用 RSS feed 获取最新内容更新
3. 视频页面包含完整的 Schema.org VideoObject 结构化数据
4. 用户页面包含 Schema.org Person 结构化数据

### 对于搜索引擎

1. 所有公开页面都有独立的 meta 标签
2. 支持 Open Graph 和 Twitter Cards
3. 提供完整的结构化数据 (JSON-LD)

## 版权与合规

- 用户上传的内容版权归原作者所有
- 平台遵守相关法律法规，提供侵权投诉渠道
- 如有版权问题，请联系: contact@saop.cc

## 联系方式

- 网站: ${baseUrl}
- 邮箱: contact@saop.cc

---
Generated: ${new Date().toISOString()}
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
