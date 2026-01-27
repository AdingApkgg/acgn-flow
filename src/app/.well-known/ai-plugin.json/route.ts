import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";
  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";

  const plugin = {
    schema_version: "v1",
    name_for_human: siteName,
    name_for_model: "acgn_flow",
    description_for_human: `${siteName} - ACGN Fans 流式媒体内容分享平台，提供动画、漫画、游戏、轻小说相关视频内容。`,
    description_for_model: `${siteName} is an ACGN (Anime, Comic, Game, Novel) streaming media content sharing platform. Users can browse and discover anime, comic, game, and light novel related video content. The platform supports video sharing, categorization, tagging, user interactions (likes, favorites, comments), and user profiles.`,
    auth: {
      type: "none",
    },
    api: {
      type: "openapi",
      url: `${baseUrl}/.well-known/openapi.yaml`,
    },
    logo_url: `${baseUrl}/icon`,
    contact_email: "contact@saop.cc",
    legal_info_url: `${baseUrl}/about`,
  };

  return NextResponse.json(plugin, {
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
