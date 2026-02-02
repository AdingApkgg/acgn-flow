"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, RefreshCw } from "lucide-react";

interface RandomImageData {
  url: string;
  proxiedUrl?: string;
  index?: number;
  total?: number;
  error?: string;
}

export default function NotFound() {
  const [imageData, setImageData] = useState<RandomImageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const hasFetched = useRef(false);

  const loadRandomImage = async () => {
    setIsLoading(true);
    setError(false);

    try {
      const response = await fetch("/api/bilibili/random-image");
      const data: RandomImageData = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setImageData(data);
    } catch (err) {
      console.error("加载图片失败:", err);
      setError(true);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      loadRandomImage();
    }
  }, []);

  const imageUrl = imageData?.proxiedUrl
    ? imageData.proxiedUrl
    : imageData?.url
      ? `/api/bilibili/image?url=${encodeURIComponent(imageData.url)}`
      : null;

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-lg">
        {/* 2233娘漫画图片 */}
        <div className="relative mx-auto rounded-lg overflow-hidden bg-muted">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="2233娘"
              className={`max-w-full max-h-[300px] object-contain transition-opacity duration-300 ${
                isLoading ? "opacity-0" : "opacity-100"
              }`}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setError(true);
                setIsLoading(false);
              }}
            />
          )}
          {isLoading && (
            <div className="w-64 h-48 flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}
          {error && !isLoading && (
            <div className="w-64 h-48 flex items-center justify-center text-4xl">
              😢
            </div>
          )}
        </div>

        {/* 错误信息 */}
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-primary">404</h1>
          <h2 className="text-xl font-medium">页面不存在</h2>
          <p className="text-muted-foreground">
            你访问的页面可能已被删除、移动或从未存在过
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-center gap-3">
          <Button asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              返回首页
            </Link>
          </Button>
          <Button variant="outline" onClick={loadRandomImage} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            换一张
          </Button>
        </div>

        {/* 图片计数 */}
        {imageData?.total && !error && (
          <p className="text-xs text-muted-foreground/60">
            第 {(imageData.index ?? 0) + 1} / {imageData.total} 张
          </p>
        )}
      </div>
    </div>
  );
}
