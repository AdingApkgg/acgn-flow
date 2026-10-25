function JsonLd({ id, data }: { id: string; data: unknown }) {
  const serialized = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD 已统一转义小于号和行分隔符，需输出原始 JSON 供爬虫读取。
    <script id={id} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialized }} />
  );
}

interface VideoJsonLdProps {
  video: {
    id: string;
    title: string;
    description: string | null;
    videoUrl: string;
    coverUrl: string | null;
    duration: number | null;
    views: number;
    createdAt: Date | string;
    updatedAt: Date | string;
    uploader: {
      id: string;
      username: string;
      nickname: string | null;
    };
    tags: Array<{
      tag: {
        name: string;
      };
    }>;
  };
}

export function VideoJsonLd({ video }: VideoJsonLdProps) {
  const baseUrl = import.meta.env.VITE_APP_URL || "https://af.saop.cc";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title,
    description: video.description || video.title,
    thumbnailUrl: video.coverUrl || `${baseUrl}/og-image.png`,
    uploadDate: new Date(video.createdAt).toISOString(),
    contentUrl: video.videoUrl,
    embedUrl: `${baseUrl}/video/${video.id}`,
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/WatchAction",
      userInteractionCount: video.views,
    },
    author: {
      "@type": "Person",
      name: video.uploader.nickname || video.uploader.username,
      url: `${baseUrl}/user/${video.uploader.id}`,
    },
    ...(video.duration && {
      duration: `PT${Math.floor(video.duration / 60)}M${video.duration % 60}S`,
    }),
    keywords: video.tags.map((t) => t.tag.name).join(", "),
  };

  return <JsonLd id="video-jsonld" data={jsonLd} />;
}

interface WebsiteJsonLdProps {
  siteName?: string;
  siteUrl?: string;
  description?: string;
}

export function WebsiteJsonLd({
  siteName = "ACGN Flow",
  siteUrl = "https://af.saop.cc",
  description = "ACGN Fans 流式媒体内容分享平台",
}: WebsiteJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: siteUrl,
    description: description,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return <JsonLd id="website-jsonld" data={jsonLd} />;
}

interface BreadcrumbJsonLdProps {
  items: Array<{
    name: string;
    url: string;
  }>;
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return <JsonLd id="breadcrumb-jsonld" data={jsonLd} />;
}

interface OrganizationJsonLdProps {
  name?: string;
  url?: string;
  logo?: string;
}

export function OrganizationJsonLd({
  name = "ACGN Flow",
  url = "https://af.saop.cc",
  logo = "https://af.saop.cc/icon",
}: OrganizationJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: name,
    url: url,
    logo: logo,
    sameAs: [],
    contactPoint: {
      "@type": "ContactPoint",
      email: "contact@saop.cc",
      contactType: "customer service",
      availableLanguage: ["Chinese", "English"],
    },
  };

  return <JsonLd id="organization-jsonld" data={jsonLd} />;
}

interface VideoListJsonLdProps {
  videos: Array<{
    id: string;
    title: string;
    description?: string | null;
    coverUrl?: string | null;
    views: number;
    createdAt: Date | string;
    uploader: {
      nickname?: string | null;
      username: string;
    };
  }>;
}

/**
 * 视频列表结构化数据 - 用于首页和列表页
 */
export function VideoListJsonLd({ videos }: VideoListJsonLdProps) {
  const baseUrl = import.meta.env.VITE_APP_URL || "https://af.saop.cc";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: videos.slice(0, 10).map((video, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "VideoObject",
        "@id": `${baseUrl}/video/${video.id}`,
        name: video.title,
        description: video.description || video.title,
        thumbnailUrl: video.coverUrl || `${baseUrl}/og-image.png`,
        uploadDate: new Date(video.createdAt).toISOString(),
        author: {
          "@type": "Person",
          name: video.uploader.nickname || video.uploader.username,
        },
        interactionStatistic: {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/WatchAction",
          userInteractionCount: video.views,
        },
      },
    })),
  };

  return <JsonLd id="videolist-jsonld" data={jsonLd} />;
}

interface FAQJsonLdProps {
  items: Array<{
    question: string;
    answer: string;
  }>;
}

/**
 * FAQ 结构化数据
 */
export function FAQJsonLd({ items }: FAQJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return <JsonLd id="faq-jsonld" data={jsonLd} />;
}

interface CollectionPageJsonLdProps {
  name: string;
  description: string;
  url: string;
  numberOfItems?: number;
}

/**
 * 集合页面结构化数据 - 用于标签页等列表页面
 */
export function CollectionPageJsonLd({
  name,
  description,
  url,
  numberOfItems,
}: CollectionPageJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url,
    ...(numberOfItems !== undefined && { numberOfItems }),
  };

  return <JsonLd id="collection-jsonld" data={jsonLd} />;
}

interface ProfilePageJsonLdProps {
  name: string;
  url: string;
  image?: string | null;
  description?: string | null;
}

/**
 * 用户主页结构化数据
 */
export function ProfilePageJsonLd({ name, url, image, description }: ProfilePageJsonLdProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name,
      url,
      ...(image && { image }),
      ...(description && { description }),
    },
  };

  return <JsonLd id="profile-jsonld" data={jsonLd} />;
}
