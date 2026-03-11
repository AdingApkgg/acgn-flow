"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Maximize,
  Minimize,
  AlertCircle,
  Loader2,
  RotateCcw,
} from "lucide-react";

const RUFFLE_LOCAL_URL = "/ruffle/ruffle.js";

interface RufflePlayerProps {
  url: string;
  poster?: string;
  className?: string;
}

interface RuffleInstance {
  load: (options: { url: string }) => Promise<void>;
  remove: () => void;
  play: () => void;
  pause: () => void;
}

interface RufflePublicAPI {
  newest: () => {
    createPlayer: () => RuffleInstance & HTMLElement;
  };
}

declare global {
  interface Window {
    RufflePlayer?: RufflePublicAPI;
  }
}

export function RufflePlayer({ url, poster, className }: RufflePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<RuffleInstance | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const createRufflePlayer = useCallback(async () => {
    if (!window.RufflePlayer) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(
          `script[src="${RUFFLE_LOCAL_URL}"]`
        );
        if (existing) {
          if (window.RufflePlayer) {
            resolve();
          } else {
            existing.addEventListener("load", () => resolve());
            existing.addEventListener("error", () =>
              reject(new Error("Ruffle 加载失败"))
            );
          }
          return;
        }

        const script = document.createElement("script");
        script.src = RUFFLE_LOCAL_URL;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Ruffle 加载失败"));
        document.head.appendChild(script);
      });
    }

    const ruffle = window.RufflePlayer!.newest();
    const player = ruffle.createPlayer();

    player.style.width = "100%";
    player.style.height = "100%";

    if (containerRef.current) {
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(player);
    }

    await player.load({ url });
    return player;
  }, [url]);

  useEffect(() => {
    let cancelled = false;

    createRufflePlayer()
      .then((player) => {
        if (cancelled) return;
        playerRef.current = player;
        setIsLoading(false);
        wrapperRef.current?.focus();
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Ruffle load error:", e);
        setError(e instanceof Error ? e.message : "Flash 内容加载失败");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try {
          playerRef.current.remove();
        } catch {
          // player might already be removed
        }
        playerRef.current = null;
      }
    };
  }, [createRufflePlayer]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!wrapperRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await wrapperRef.current.requestFullscreen();
      }
    } catch {
      // fullscreen not supported
    }
  }, []);

  const handleReload = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.remove();
      } catch {
        // ignore
      }
      playerRef.current = null;
    }
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
    setIsLoading(true);
    setError(null);
    createRufflePlayer()
      .then((player) => {
        playerRef.current = player;
        setIsLoading(false);
        wrapperRef.current?.focus();
      })
      .catch((e) => {
        console.error("Ruffle load error:", e);
        setError(e instanceof Error ? e.message : "Flash 内容加载失败");
        setIsLoading(false);
      });
  }, [createRufflePlayer]);

  // 键盘快捷键
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "Escape":
          if (document.fullscreenElement) {
            e.preventDefault();
            document.exitFullscreen();
          }
          break;
        case "r":
        case "R":
          e.preventDefault();
          handleReload();
          break;
      }
    },
    [toggleFullscreen, handleReload]
  );

  if (error) {
    return (
      <div
        className={cn(
          "relative flex aspect-video items-center justify-center rounded-lg bg-black",
          className
        )}
      >
        <div className="flex flex-col items-center gap-3 text-white">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="text-sm text-neutral-300">{error}</p>
          <Button variant="outline" size="sm" onClick={handleReload}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            重试
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={cn("group relative rounded-lg bg-black outline-none", className)}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          {poster ? (
            <Image
              src={poster}
              alt="Flash cover"
              fill
              unoptimized
              className="absolute inset-0 rounded-lg object-cover opacity-50"
            />
          ) : (
            <Skeleton className="absolute inset-0 rounded-lg" />
          )}
          <div className="z-20 flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            <span className="text-sm text-white/80">正在加载 Flash 内容...</span>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="aspect-video w-full overflow-hidden rounded-lg"
      />

      {/* Toolbar overlay */}
      <div className="absolute right-2 bottom-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-black/50 text-white hover:bg-black/70"
          onClick={handleReload}
          title="重新加载 (R)"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-black/50 text-white hover:bg-black/70"
          onClick={toggleFullscreen}
          title={isFullscreen ? "退出全屏 (F)" : "全屏 (F)"}
        >
          {isFullscreen ? (
            <Minimize className="h-4 w-4" />
          ) : (
            <Maximize className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
