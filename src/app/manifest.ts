import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ACGN Flow",
    short_name: "ACGN Flow",
    description: "ACGN Fans 流式媒体内容分享平台",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    categories: ["entertainment", "video"],
    lang: "zh-CN",
  };
}
