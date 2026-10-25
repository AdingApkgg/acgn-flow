import type { MetaDescriptor } from "react-router";

export const siteName = import.meta.env.VITE_APP_NAME || "ACGN Flow";
export const siteUrl = import.meta.env.VITE_APP_URL || "http://localhost:1270";

export function pageMeta(
  title: string,
  description: string,
  path: string,
  options: { image?: string | null; type?: string; noindex?: boolean; keywords?: string[] } = {},
): MetaDescriptor[] {
  const fullTitle = `${title} | ${siteName}`;
  const url = new URL(path, siteUrl).href;
  const image = new URL(options.image || "/opengraph-image", siteUrl).href;
  return [
    { title: fullTitle },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    {
      name: "robots",
      content: options.noindex
        ? "noindex, follow"
        : "index, follow, max-image-preview:large, max-video-preview:-1, max-snippet:-1",
    },
    { property: "og:site_name", content: siteName },
    { property: "og:locale", content: "zh_CN" },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: options.type || "website" },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    ...(options.keywords ? [{ name: "keywords", content: options.keywords.join(",") }] : []),
  ];
}
