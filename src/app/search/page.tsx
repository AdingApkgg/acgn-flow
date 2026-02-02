import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { SearchContent } from "./client";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

// 动态生成 metadata
export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const { q: query } = await searchParams;
  
  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";

  if (!query) {
    return {
      title: "搜索视频",
      description: `在 ${siteName} 搜索 ACGN 相关视频内容`,
    };
  }

  return {
    title: `"${query}" 的搜索结果`,
    description: `在 ${siteName} 搜索 "${query}" 的相关视频`,
    robots: {
      index: false, // 搜索结果页不索引
      follow: true,
    },
  };
}

function SearchFallback() {
  return (
    <div className="container py-12 text-center">
      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
      <p className="text-muted-foreground mt-4">加载中...</p>
    </div>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q: query } = await searchParams;

  return (
    <Suspense fallback={<SearchFallback />}>
      <SearchContent query={query || ""} />
    </Suspense>
  );
}
