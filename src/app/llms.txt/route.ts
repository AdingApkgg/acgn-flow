import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";
  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";

  const content = `# ${siteName}

> ${siteName} 是一个 ACGN（Anime、Comic、Game、Novel）流式媒体内容分享平台。

## 关于本站

${siteName} 为 ACGN 爱好者提供一个分享和发现优质内容的平台。用户可以上传视频链接、浏览视频、收藏喜欢的内容、与其他用户互动。

## 主要功能

- **视频分享**: 用户可以分享 ACGN 相关视频内容
- **分类浏览**: 按动画、漫画、游戏、轻小说等分类浏览内容
- **标签系统**: 通过标签快速找到感兴趣的内容
- **用户互动**: 点赞、收藏、评论功能
- **用户主页**: 查看其他用户分享的内容

## 内容类型

本站主要包含以下类型的内容：
- 动画 (Anime) 相关视频
- 漫画 (Comic) 相关视频
- 游戏 (Game) 相关视频
- 轻小说 (Novel) 相关视频
- VOCALOID/虚拟歌手音乐视频
- 二次元文化相关内容

## API 访问

本站不提供公开 API，但提供以下数据源：
- RSS Feed: ${baseUrl}/feed.xml
- Sitemap: ${baseUrl}/sitemap.xml

## 联系方式

如需更多信息，请访问: ${baseUrl}

## 版权说明

本站用户上传的内容版权归原作者所有。如有侵权，请联系站长处理。

---
Last updated: ${new Date().toISOString().split("T")[0]}
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
