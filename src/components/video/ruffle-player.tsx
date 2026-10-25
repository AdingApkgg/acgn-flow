import { AlertCircle, Loader2, Maximize, Minimize, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const LOAD_TIMEOUT_MS = 45_000;

interface RufflePlayerProps {
  url: string;
  poster?: string;
  className?: string;
}

export function RufflePlayer({ url, poster, className }: RufflePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    // 重载序号使每次手动重试拥有独立的清理函数。
    void reloadVersion;
    setIsLoading(true);
    setError(null);
    const frame = document.createElement("iframe");
    frame.title = "Flash 内容沙箱";
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("allow", "autoplay; fullscreen");
    frame.referrerPolicy = "no-referrer";
    frame.className = "h-full w-full border-0";
    frame.src = `/flash-frame?url=${encodeURIComponent(url)}`;
    const fail = () => {
      setError("Flash 内容加载失败，请确认文件可匿名访问且支持 CORS");
      setIsLoading(false);
    };
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== "null") return;
      if (event.data?.channel !== "acgn-flash") return;
      if (event.data.type !== "ready" && event.data.type !== "error") return;
      clearTimeout(timer);
      if (event.data.type === "error") fail();
      else {
        setIsLoading(false);
        wrapperRef.current?.focus();
      }
    };
    window.addEventListener("message", onMessage);
    containerRef.current.appendChild(frame);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      frame.remove();
    };
  }, [url, reloadVersion]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
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
      // 浏览器可能不支持全屏，保留普通播放。
    }
  }, []);

  const handleReload = useCallback(() => {
    setReloadVersion((version) => version + 1);
  }, []);

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
            void document.exitFullscreen().catch(() => {});
          }
          break;
        case "r":
        case "R":
          e.preventDefault();
          handleReload();
          break;
      }
    },
    [toggleFullscreen, handleReload],
  );

  return (
    <div
      ref={wrapperRef}
      className={cn("group relative rounded-lg bg-black outline-none", className)}
      role="application"
      aria-label="Flash 播放器"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {error && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-black"
          role="alert"
        >
          <div className="flex flex-col items-center gap-3 text-white">
            <AlertCircle className="h-12 w-12 text-red-400" />
            <p className="text-sm text-neutral-300">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={handleReload}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              重试
            </Button>
          </div>
        </div>
      )}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          {poster ? (
            <img
              src={poster}
              alt="Flash 封面"
              className="absolute inset-0 h-full w-full rounded-lg object-cover opacity-50"
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

      <div ref={containerRef} className="aspect-video w-full overflow-hidden rounded-lg" />

      {/* 播放器工具栏 */}
      <div className="absolute right-2 bottom-2 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-black/50 text-white hover:bg-black/70"
          onClick={handleReload}
          title="重新加载 (R)"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 bg-black/50 text-white hover:bg-black/70"
          onClick={toggleFullscreen}
          title={isFullscreen ? "退出全屏 (F)" : "全屏 (F)"}
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
