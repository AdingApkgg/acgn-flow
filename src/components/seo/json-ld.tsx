"use client";

import Script from "next/script";

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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";

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

  return (
    <Script
      id="video-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
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

  return (
    <Script
      id="website-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
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

  return (
    <Script
      id="breadcrumb-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
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

  return (
    <Script
      id="organization-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";

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

  return (
    <Script
      id="videolist-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
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

  return (
    <Script
      id="faq-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
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

  return (
    <Script
      id="collection-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
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
export function ProfilePageJsonLd({
  name,
  url,
  image,
  description,
}: ProfilePageJsonLdProps) {
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

  return (
    <Script
      id="profile-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
