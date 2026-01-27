"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import { Play, AlertCircle } from "lucide-react";

interface VideoPlayerProps {
  url: string;
  poster?: string | null;
  onProgress?: (progress: { played: number; playedSeconds: number }) => void;
  onEnded?: () => void;
  initialProgress?: number;
}

export function VideoPlayer({
  url,
  poster,
  onProgress,
  onEnded,
  initialProgress = 0,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showPlayer, setShowPlayer] = useState(!poster);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setIsReady(true);
      if (initialProgress > 0) {
        video.currentTime = initialProgress;
      }
    };

    const handleError = () => {
      setHasError(true);
    };

    const handleEnded = () => {
      onEnded?.();
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("error", handleError);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleError);
      video.removeEventListener("ended", handleEnded);
    };
  }, [initialProgress, onEnded, showPlayer]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !onProgress) return;

    const played = video.duration ? video.currentTime / video.duration : 0;
    onProgress({
      played,
      playedSeconds: video.currentTime,
    });
  }, [onProgress]);

  const handlePlay = () => {
    setShowPlayer(true);
  };

  // 当显示播放器后自动播放
  useEffect(() => {
    const video = videoRef.current;
    if (showPlayer && video && poster) {
      // 延迟执行以确保视频元素已完全渲染
      const timer = setTimeout(() => {
        if (video && document.contains(video)) {
          video.play().catch(() => {
            // 自动播放失败，忽略（用户需要手动点击播放）
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showPlayer, poster]);

  if (hasError) {
    return (
      <div className="aspect-video bg-muted flex flex-col items-center justify-center rounded-lg gap-2">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">视频加载失败</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline"
        >
          尝试直接打开
        </a>
      </div>
    );
  }

  // 显示封面预览模式
  if (!showPlayer && poster) {
    return (
      <div
        className="relative aspect-video bg-black rounded-lg overflow-hidden cursor-pointer group"
        onClick={handlePlay}
      >
        <Image
          src={poster}
          alt="Video poster"
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 66vw, 50vw"
        />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/50 transition-colors">
          <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <Play className="w-8 h-8 text-black ml-1" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
      {!isReady && <Skeleton className="absolute inset-0" />}
      <video
        ref={videoRef}
        src={url}
        poster={poster || undefined}
        controls
        playsInline
        preload="metadata"
        className="w-full h-full"
        onTimeUpdate={handleTimeUpdate}
      >
        您的浏览器不支持视频播放
      </video>
    </div>
  );
}
