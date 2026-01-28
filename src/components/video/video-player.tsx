"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import Artplayer from "artplayer";
import artplayerPluginDanmuku from "artplayer-plugin-danmuku";
import { Skeleton } from "@/components/ui/skeleton";
import { Play, AlertCircle } from "lucide-react";

// 字幕配置接口
interface SubtitleTrack {
  url: string;
  name: string;
  default?: boolean;
}

interface VideoPlayerProps {
  url: string;
  poster?: string | null;
  onProgress?: (progress: { played: number; playedSeconds: number }) => void;
  onEnded?: () => void;
  initialProgress?: number;
  subtitles?: SubtitleTrack[];
  danmakuUrl?: string;
  autoStart?: boolean; // 是否直接开始播放（跳过封面预览）
}

export function VideoPlayer({
  url,
  poster,
  onProgress,
  onEnded,
  initialProgress = 0,
  subtitles = [],
  danmakuUrl,
  autoStart = true, // 默认自动播放
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showPlayer, setShowPlayer] = useState(autoStart || !poster);
  
  // 使用 ref 存储不应触发重新初始化的值
  const onProgressRef = useRef(onProgress);
  const onEndedRef = useRef(onEnded);
  const initialProgressRef = useRef(initialProgress);
  const posterRef = useRef(poster);
  const subtitlesRef = useRef(subtitles);
  const hasInitializedRef = useRef(false);

  // 保持回调和配置引用最新（不触发重新初始化）
  useEffect(() => {
    onProgressRef.current = onProgress;
    onEndedRef.current = onEnded;
    posterRef.current = poster;
    subtitlesRef.current = subtitles;
  }, [onProgress, onEnded, poster, subtitles]);
  
  // 只在首次设置时更新 initialProgress
  useEffect(() => {
    if (!hasInitializedRef.current) {
      initialProgressRef.current = initialProgress;
    }
  }, [initialProgress]);
  
  // 稳定的字幕 URL 列表，用于依赖比较
  const subtitleUrls = useMemo(() => 
    subtitles.map(s => s.url).join(","), 
    [subtitles]
  );

  // 初始化 ArtPlayer
  useEffect(() => {
    if (!showPlayer || !containerRef.current) return;

    // 销毁之前的实例
    if (artRef.current) {
      artRef.current.destroy();
      artRef.current = null;
    }

    // 构建插件列表
    const plugins: Artplayer["option"]["plugins"] = [];

    // 弹幕插件（性能优化版）
    if (danmakuUrl) {
      const isJsonFormat = danmakuUrl.endsWith(".json");
      
      // 弹幕密度控制 - 每秒最大弹幕数
      const MAX_DANMAKU_PER_SECOND = 15;
      // 同屏最大弹幕数
      const MAX_VISIBLE_DANMAKU = 50;
      // 追踪同屏弹幕数量
      let visibleCount = 0;
      
      // JSON 格式需要自定义解析
      const fetchJsonDanmaku = async () => {
        try {
          const response = await fetch(danmakuUrl);
          const data = await response.json();
          
          // 支持多种 JSON 结构
          let list = data;
          if (!Array.isArray(data)) {
            list = data.danmaku || data.danmakus || data.comments || data.data || [];
          }
          
          if (!Array.isArray(list)) return [];
          
          return list.map((item: { text?: string; content?: string; message?: string; time?: number; color?: string; mode?: number }) => ({
            text: item.text || item.content || item.message || "",
            time: item.time || 0,
            color: item.color || "#FFFFFF",
            mode: (item.mode ?? 0) as 0 | 1 | 2,
          }));
        } catch (error) {
          console.error("Failed to fetch danmaku:", error);
          return [];
        }
      };

      // 弹幕密度过滤器 - 限制每秒弹幕数量
      const danmakuTimeMap = new Map<number, number>();
      const densityFilter = (danmu: { time?: number }) => {
        const timeKey = Math.floor(danmu.time || 0);
        const count = danmakuTimeMap.get(timeKey) || 0;
        if (count >= MAX_DANMAKU_PER_SECOND) {
          return false;
        }
        danmakuTimeMap.set(timeKey, count + 1);
        return true;
      };

      plugins.push(
        artplayerPluginDanmuku({
          // JSON 用函数解析，XML 直接传 URL 让插件处理
          danmuku: isJsonFormat ? fetchJsonDanmaku : danmakuUrl,
          speed: 5,
          opacity: 1,
          fontSize: 25,
          color: "#FFFFFF",
          mode: 0,
          margin: [10, "25%"],
          antiOverlap: true,
          synchronousPlayback: false,
          // 弹幕加载时过滤 - 限制每秒弹幕密度
          filter: densityFilter,
          // 弹幕显示前过滤 - 限制同屏弹幕数量
          beforeVisible: () => {
            if (visibleCount >= MAX_VISIBLE_DANMAKU) {
              return false;
            }
            visibleCount++;
            // 弹幕显示时间约等于 speed 秒，之后自动减少计数
            setTimeout(() => {
              visibleCount = Math.max(0, visibleCount - 1);
            }, 5000);
            return true;
          },
          // 热力图优化配置 - 降低采样精度以提升性能
          heatmap: {
            sampling: 50, // 降低采样精度（默认约 width/100）
            smoothing: 0.3, // 平滑系数
            flattening: 0.2, // 扁平化系数
            opacity: 0.2,
          },
        })
      );
    }

    // 使用 ref 中的值，避免依赖变化导致重建
    const currentSubtitles = subtitlesRef.current;
    const currentPoster = posterRef.current;
    
    const art = new Artplayer({
      container: containerRef.current,
      url: url,
      poster: currentPoster || "",
      volume: 0.7,
      isLive: false,
      muted: false,
      autoplay: true, // 自动播放
      pip: true,
      autoSize: false,
      autoMini: false,
      screenshot: true,
      setting: true,
      loop: false,
      flip: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      subtitleOffset: true,
      miniProgressBar: true,
      mutex: true,
      backdrop: true,
      playsInline: true,
      autoPlayback: true,
      airplay: true,
      theme: "#a855f7", // 主题色 - 紫色
      lang: "zh-cn",
      // 注意：不设置 crossOrigin，因为外部视频源（如B站）不支持 CORS
      // 这会导致截图功能对跨域视频不可用，但视频可以正常播放
      plugins: plugins,
      // 字幕配置（仅在有字幕时添加）
      ...(currentSubtitles.length > 0
        ? {
            subtitle: {
              url: currentSubtitles.find((s) => s.default)?.url || currentSubtitles[0]?.url || "",
              type: "vtt",
              style: {
                color: "#fff",
                fontSize: "20px",
                textShadow: "0 2px 4px rgba(0, 0, 0, 0.8)",
              },
              encoding: "utf-8",
            },
          }
        : {}),
      // 设置菜单
      settings: [
        // 播放速度
        {
          html: "播放速度",
          width: 150,
          tooltip: "1x",
          selector: [
            { html: "0.5x", value: 0.5 },
            { html: "0.75x", value: 0.75 },
            { html: "1x", value: 1, default: true },
            { html: "1.25x", value: 1.25 },
            { html: "1.5x", value: 1.5 },
            { html: "2x", value: 2 },
          ],
          onSelect(item) {
            art.playbackRate = item.value as number;
            return item.html as string;
          },
        },
        // 字幕切换（如果有多个字幕）
        ...(currentSubtitles.length > 1
          ? [
              {
                html: "字幕",
                width: 200,
                tooltip: currentSubtitles.find((s) => s.default)?.name || currentSubtitles[0]?.name || "无",
                selector: [
                  { html: "关闭", value: "" },
                  ...currentSubtitles.map((sub) => ({
                    html: sub.name,
                    value: sub.url,
                    default: sub.default,
                  })),
                ],
                onSelect(item: { html?: string; value?: unknown }) {
                  const value = item.value as string | undefined;
                  if (value) {
                    art.subtitle.switch(value);
                  } else {
                    art.subtitle.show = false;
                  }
                  return (item.html || "") as string;
                },
              },
            ]
          : []),
      ],
      // 控制栏配置（pip: true 已内置画中画按钮）
      controls: [],
      // 快捷键
      hotkey: true,
    });

    artRef.current = art;

    // 事件监听
    art.on("ready", () => {
      setIsReady(true);
      setHasError(false);
      hasInitializedRef.current = true;
      
      // 设置初始进度（只在首次初始化时）
      const progress = initialProgressRef.current;
      if (progress > 0) {
        art.currentTime = progress;
      }
    });

    art.on("error", () => {
      setHasError(true);
    });

    art.on("video:ended", () => {
      onEndedRef.current?.();
    });

    art.on("video:timeupdate", () => {
      if (onProgressRef.current && art.duration) {
        onProgressRef.current({
          played: art.currentTime / art.duration,
          playedSeconds: art.currentTime,
        });
      }
    });

    return () => {
      if (artRef.current) {
        artRef.current.destroy();
        artRef.current = null;
      }
    };
    // 只在 url、danmakuUrl 或字幕列表真正变化时重建播放器
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPlayer, url, danmakuUrl, subtitleUrls]);

  const handlePlay = useCallback(() => {
    setShowPlayer(true);
  }, []);

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
          unoptimized
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
      {/* 加载骨架屏 - 使用 CSS 过渡淡出 */}
      <div 
        className={`absolute inset-0 z-10 transition-opacity duration-500 ${
          isReady ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <Skeleton className="w-full h-full" />
      </div>
      {/* 播放器容器 - 使用 CSS 过渡淡入 */}
      <div 
        ref={containerRef} 
        className={`w-full h-full transition-opacity duration-300 ${
          isReady ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
