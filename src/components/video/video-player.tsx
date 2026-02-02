"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Play,
  Pause,
  AlertCircle,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Subtitles,
  AudioLines,
  Layers,
  MessageSquare,
  SkipBack,
  SkipForward,
  PictureInPicture2,
  Loader2,
  Lock,
  Unlock,
  RotateCcw,
  RotateCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

// 动态导入 ReactPlayer 避免 SSR 问题
const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

// 弹幕设置接口
interface DanmakuSettings {
  opacity: number;
  scale: number;
  speed: number;
  area: number;
  typeFilter: {
    scroll: boolean;
    top: boolean;
    bottom: boolean;
    advanced: boolean;
  };
  density: "unlimited" | "normal" | "less";
  blockList: string[];
}

// 弹幕渲染器接口
interface DanmakuRenderer {
  load: (comments: DanmakuComment[]) => void;
  time: (ms: number) => void;
  start: () => void;
  stop: () => void;
  clear: () => void;
  setSettings: (settings: DanmakuSettings) => void;
}

interface DanmakuComment {
  text: string;
  stime: number;
  mode: number;
  size: number;
  color: number;
  advanced?: {
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    duration?: number;
    rotateX?: number;
    rotateY?: number;
    rotateZ?: number;
    fadeStart?: number;
    fadeEnd?: number;
    fontFamily?: string;
    isBorder?: boolean;
    linear?: boolean;
  };
}

// 默认弹幕设置
const defaultDanmakuSettings: DanmakuSettings = {
  opacity: 1,
  scale: 1,
  speed: 1,
  area: 1,
  typeFilter: {
    scroll: true,
    top: true,
    bottom: true,
    advanced: true,
  },
  density: "unlimited",
  blockList: [],
};

// 字幕解析函数
function parseSubtitle(content: string, url: string): Array<{ start: number; end: number; text: string }> {
  const cues: Array<{ start: number; end: number; text: string }> = [];
  const ext = url.split(".").pop()?.toLowerCase();

  const parseTime = (timeStr: string): number => {
    const match = timeStr.match(/(\d+):(\d+):(\d+)[.,](\d+)/);
    if (match) {
      const [, h, m, s, ms] = match;
      return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
    }
    const shortMatch = timeStr.match(/(\d+):(\d+)[.,](\d+)/);
    if (shortMatch) {
      const [, m, s, ms] = shortMatch;
      return parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
    }
    return 0;
  };

  if (ext === "vtt" || content.includes("WEBVTT")) {
    const lines = content.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line.includes("-->")) {
        const [startStr, endStr] = line.split("-->").map((s) => s.trim());
        const start = parseTime(startStr);
        const end = parseTime(endStr);
        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== "") {
          textLines.push(lines[i].trim());
          i++;
        }
        if (textLines.length > 0) {
          cues.push({ start, end, text: textLines.join("\n") });
        }
      }
      i++;
    }
  } else if (ext === "srt") {
    const blocks = content.split(/\r?\n\r?\n/);
    for (const block of blocks) {
      const lines = block.trim().split(/\r?\n/);
      if (lines.length >= 3) {
        const timeLine = lines[1];
        if (timeLine.includes("-->")) {
          const [startStr, endStr] = timeLine.split("-->").map((s) => s.trim());
          const start = parseTime(startStr);
          const end = parseTime(endStr);
          const text = lines.slice(2).join("\n");
          cues.push({ start, end, text });
        }
      }
    }
  } else if (ext === "ass" || ext === "ssa") {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith("Dialogue:")) {
        const parts = line.substring(9).split(",");
        if (parts.length >= 10) {
          const startStr = parts[1].trim();
          const endStr = parts[2].trim();
          const parseAssTime = (t: string): number => {
            const m = t.match(/(\d+):(\d+):(\d+)\.(\d+)/);
            if (m) {
              return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100;
            }
            return 0;
          };
          const start = parseAssTime(startStr);
          const end = parseAssTime(endStr);
          const text = parts.slice(9).join(",").replace(/\{[^}]*\}/g, "").trim();
          if (text) {
            cues.push({ start, end, text });
          }
        }
      }
    }
  }

  return cues.sort((a, b) => a.start - b.start);
}

// CSS 弹幕渲染器
function createDanmakuRenderer(container: HTMLElement): DanmakuRenderer {
  let comments: DanmakuComment[] = [];
  let currentTime = 0;
  let isRunning = false;
  let lastRenderTime = 0;
  let settings: DanmakuSettings = { ...defaultDanmakuSettings };
  let animationId: number | null = null;
  const activeElements = new Set<HTMLElement>();
  const renderedTimes = new Set<number>();
  let renderedInSecond = 0;
  let lastSecond = 0;

  const isTypeFiltered = (mode: number): boolean => {
    const { typeFilter } = settings;
    if (mode >= 1 && mode <= 3) return !typeFilter.scroll;
    if (mode === 4) return !typeFilter.bottom;
    if (mode === 5) return !typeFilter.top;
    if (mode === 6) return !typeFilter.scroll;
    if (mode === 7) return !typeFilter.advanced;
    return !typeFilter.scroll;
  };

  const isBlocked = (text: string): boolean => {
    return settings.blockList.some((word) => text.includes(word));
  };

  const getDensityLimit = (): number => {
    switch (settings.density) {
      case "less": return 3;
      case "normal": return 8;
      default: return 999;
    }
  };

  const render = () => {
    if (!isRunning) return;

    const now = currentTime;
    const currentSecond = Math.floor(now / 1000);
    
    if (currentSecond !== lastSecond) {
      renderedInSecond = 0;
      lastSecond = currentSecond;
    }

    const densityLimit = getDensityLimit();

    comments.forEach((comment, index) => {
      const uniqueKey = comment.stime * 10000 + index;
      if (
        comment.stime >= now - 100 &&
        comment.stime < now + 100 &&
        !renderedTimes.has(uniqueKey)
      ) {
        if (isTypeFiltered(comment.mode)) return;
        if (isBlocked(comment.text)) return;
        if (renderedInSecond >= densityLimit) return;
        
        renderedTimes.add(uniqueKey);
        renderedInSecond++;
        renderComment(comment);
      }
    });

    animationId = requestAnimationFrame(render);
  };

  const trackCount = 15;
  const tracks: number[] = new Array(trackCount).fill(0);
  const bottomTracks: number[] = new Array(5).fill(0);
  const topTracks: number[] = new Array(5).fill(0);

  const getAvailableTrack = (trackArray: number[], now: number): number => {
    for (let i = 0; i < trackArray.length; i++) {
      if (trackArray[i] <= now) {
        return i;
      }
    }
    let minIndex = 0;
    for (let i = 1; i < trackArray.length; i++) {
      if (trackArray[i] < trackArray[minIndex]) {
        minIndex = i;
      }
    }
    return minIndex;
  };

  const renderComment = (comment: DanmakuComment) => {
    const el = document.createElement("div");
    el.textContent = comment.text;
    
    const colorHex = comment.color.toString(16).padStart(6, "0");
    const fontSize = comment.size * settings.scale;
    const areaMultiplier = settings.area;
    const speedMultiplier = settings.speed;
    
    el.style.cssText = `
      position: absolute;
      white-space: nowrap;
      font-size: ${fontSize}px;
      color: #${colorHex};
      text-shadow: 1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8);
      pointer-events: none;
      opacity: ${settings.opacity};
      z-index: 10;
      font-family: "Microsoft YaHei", "SimHei", sans-serif;
      font-weight: bold;
    `;

    let baseDuration = 8000 / speedMultiplier;

    switch (comment.mode) {
      case 1:
      case 2:
      case 3:
        {
          const effectiveTrackCount = Math.floor(trackCount * areaMultiplier);
          const track = getAvailableTrack(tracks.slice(0, effectiveTrackCount), currentTime);
          const trackHeight = (100 * areaMultiplier) / effectiveTrackCount;
          el.style.top = `${track * trackHeight}%`;
          el.style.right = "-100%";
          el.style.animation = `danmaku-scroll ${baseDuration}ms linear forwards`;
          tracks[track] = currentTime + baseDuration;
        }
        break;

      case 4:
        {
          const duration = 4000 / speedMultiplier;
          const effectiveBottom = 15 + (1 - areaMultiplier) * 40;
          const track = getAvailableTrack(bottomTracks, currentTime);
          el.style.bottom = `${effectiveBottom + track * 8}%`;
          el.style.left = "50%";
          el.style.transform = "translateX(-50%)";
          el.style.animation = `danmaku-fade ${duration}ms ease-out forwards`;
          bottomTracks[track] = currentTime + duration;
          baseDuration = duration;
        }
        break;

      case 5:
        {
          const duration = 4000 / speedMultiplier;
          const track = getAvailableTrack(topTracks, currentTime);
          el.style.top = `${5 + track * 8}%`;
          el.style.left = "50%";
          el.style.transform = "translateX(-50%)";
          el.style.animation = `danmaku-fade ${duration}ms ease-out forwards`;
          topTracks[track] = currentTime + duration;
          baseDuration = duration;
        }
        break;

      case 6:
        {
          const track = getAvailableTrack(tracks, currentTime);
          const trackHeight = 100 / trackCount;
          el.style.top = `${track * trackHeight}%`;
          el.style.left = "-100%";
          el.style.animation = `danmaku-scroll-reverse ${baseDuration}ms linear forwards`;
          tracks[track] = currentTime + baseDuration;
        }
        break;

      case 7:
        if (comment.advanced) {
          const adv = comment.advanced;
          const advDuration = adv.duration || 4000;
          
          const startX = adv.startX ?? 50;
          const startY = adv.startY ?? 50;
          el.style.left = `${startX}%`;
          el.style.top = `${startY}%`;
          
          if (adv.fontFamily) {
            el.style.fontFamily = `"${adv.fontFamily}", "Microsoft YaHei", sans-serif`;
          }
          
          if (adv.isBorder) {
            el.style.border = "1px solid currentColor";
            el.style.padding = "2px 4px";
          }
          
          const fadeStart = adv.fadeStart ?? 1;
          const fadeEnd = adv.fadeEnd ?? 1;
          el.style.opacity = String(fadeStart * settings.opacity);
          
          const transforms: string[] = ["translate(-50%, -50%)"];
          if (adv.rotateX) transforms.push(`rotateX(${adv.rotateX}deg)`);
          if (adv.rotateY) transforms.push(`rotateY(${adv.rotateY}deg)`);
          if (adv.rotateZ) transforms.push(`rotateZ(${adv.rotateZ}deg)`);
          el.style.transform = transforms.join(" ");
          
          if (adv.endX !== undefined || adv.endY !== undefined) {
            const endX = adv.endX ?? startX;
            const endY = adv.endY ?? startY;
            const animName = `adv-move-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            
            const keyframes = `
              @keyframes ${animName} {
                0% { 
                  left: ${startX}%; 
                  top: ${startY}%; 
                  opacity: ${fadeStart * settings.opacity};
                }
                100% { 
                  left: ${endX}%; 
                  top: ${endY}%; 
                  opacity: ${fadeEnd * settings.opacity};
                }
              }
            `;
            
            const styleEl = document.createElement("style");
            styleEl.textContent = keyframes;
            container.appendChild(styleEl);
            
            el.style.animation = `${animName} ${advDuration}ms ${adv.linear ? "linear" : "ease-in-out"} forwards`;
            
            setTimeout(() => styleEl.remove(), advDuration + 100);
          } else {
            el.style.animation = `danmaku-fade ${advDuration}ms ease-out forwards`;
          }
        } else {
          el.style.top = "50%";
          el.style.left = "50%";
          el.style.transform = "translate(-50%, -50%)";
          el.style.animation = `danmaku-fade 4s ease-out forwards`;
        }
        break;

      default:
        {
          const track = getAvailableTrack(tracks, currentTime);
          const trackHeight = 100 / trackCount;
          el.style.top = `${track * trackHeight}%`;
          el.style.right = "-100%";
          el.style.animation = `danmaku-scroll ${baseDuration}ms linear forwards`;
          tracks[track] = currentTime + baseDuration;
        }
    }

    container.appendChild(el);
    activeElements.add(el);

    el.addEventListener("animationend", () => {
      el.remove();
      activeElements.delete(el);
    });

    setTimeout(() => {
      if (el.parentNode) {
        el.remove();
        activeElements.delete(el);
      }
    }, baseDuration + 1000);
  };

  return {
    load: (newComments) => {
      comments = newComments.sort((a, b) => a.stime - b.stime);
      renderedTimes.clear();
    },
    time: (ms) => {
      currentTime = ms;
      if (Math.abs(ms - lastRenderTime) > 2000) {
        renderedTimes.clear();
      }
      lastRenderTime = ms;
    },
    start: () => {
      if (!isRunning) {
        isRunning = true;
        render();
      }
    },
    stop: () => {
      isRunning = false;
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    },
    clear: () => {
      activeElements.forEach((el) => el.remove());
      activeElements.clear();
      renderedTimes.clear();
    },
    setSettings: (newSettings) => {
      settings = { ...settings, ...newSettings };
    },
  };
}

// 字幕轨道接口
export interface SubtitleTrack {
  url: string;
  name: string;
  language?: string;
  default?: boolean;
}

// 音轨接口
export interface AudioTrack {
  id: number;
  name: string;
  language?: string;
  default?: boolean;
}

// 画质接口
export interface QualityLevel {
  url: string;
  name: string;
  height?: number;
  default?: boolean;
}

// 弹幕数据接口
export interface DanmakuItem {
  text: string;
  time: number;
  color?: string;
  mode?: number;
  size?: number;
  advanced?: {
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    duration?: number;
    rotateZ?: number;
    fadeStart?: number;
    fadeEnd?: number;
    fontFamily?: string;
    linear?: boolean;
  };
}

interface VideoPlayerProps {
  url: string;
  qualities?: QualityLevel[];
  poster?: string | null;
  onProgress?: (progress: { played: number; playedSeconds: number }) => void;
  onEnded?: () => void;
  initialProgress?: number;
  subtitles?: SubtitleTrack[];
  danmakuUrl?: string;
  danmakuList?: DanmakuItem[];
  autoStart?: boolean;
}

// 格式化时间
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface VideoPlayerRef {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

// 移动端检测 Hook
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.matchMedia("(max-width: 768px)").matches ||
        ("ontouchstart" in window && navigator.maxTouchPoints > 0)
      );
    };
    
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  return isMobile;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  function VideoPlayer(
    {
      url,
      qualities = [],
      poster,
      onProgress,
      onEnded,
      initialProgress = 0,
      subtitles = [],
      danmakuUrl,
      danmakuList,
      autoStart = true,
    },
    ref
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const danmakuContainerRef = useRef<HTMLDivElement>(null);
    const danmakuRendererRef = useRef<DanmakuRenderer | null>(null);
    const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // 触摸操作相关
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const touchMoveRef = useRef<{ x: number; y: number } | null>(null);
    const lastTapRef = useRef<{ time: number; x: number } | null>(null);
    const gestureActiveRef = useRef<"none" | "progress" | "volume" | "brightness">("none");
    const gestureStartValueRef = useRef<number>(0);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressingRef = useRef(false);
    
    // 手势提示状态
    const [gestureHint, setGestureHint] = useState<{ type: string; value: string; icon?: string } | null>(null);
    const gestureHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 移动端检测
    const isMobile = useIsMobile();

    // 客户端挂载状态
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
      setIsMounted(true);
    }, []);

    // 播放器状态
    const [isReady, setIsReady] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [showPlayer, setShowPlayer] = useState(autoStart || !poster);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(0.7);
    const [played, setPlayed] = useState(0);
    const [playedSeconds, setPlayedSeconds] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isBuffering, setIsBuffering] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isLocked, setIsLocked] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);

    // 多媒体轨道状态
    const [currentQuality, setCurrentQuality] = useState<QualityLevel | null>(
      qualities.find((q) => q.default) || qualities[0] || null
    );
    const [currentSubtitle, setCurrentSubtitle] = useState<SubtitleTrack | null>(
      subtitles.find((s) => s.default) || subtitles[0] || null
    );
    const [subtitlesEnabled, setSubtitlesEnabled] = useState(!!currentSubtitle);
    const [subtitleCues, setSubtitleCues] = useState<Array<{ start: number; end: number; text: string }>>([]);
    const [currentCue, setCurrentCue] = useState<string>("");
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
    const [currentAudioTrack, setCurrentAudioTrack] = useState<AudioTrack | null>(null);

    // 弹幕状态
    const [danmakuEnabled, setDanmakuEnabled] = useState(true);
    const [danmakuData, setDanmakuData] = useState<DanmakuItem[]>([]);
    const [danmakuSettings, setDanmakuSettings] = useState<DanmakuSettings>(defaultDanmakuSettings);

    // 当前播放 URL
    const currentUrl = useMemo(() => {
      if (currentQuality) {
        return currentQuality.url;
      }
      return url;
    }, [currentQuality, url]);

    // URL 变化时重置状态
    useEffect(() => {
      setIsReady(false);
      setHasError(false);
      setPlayed(0);
      setPlayedSeconds(0);
      setDuration(0);
    }, [url]);

    // 获取内部视频元素
    const getVideoElement = useCallback(() => {
      return containerRef.current?.querySelector("video") as HTMLVideoElement | null;
    }, []);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      seekTo: (seconds: number) => {
        const video = getVideoElement();
        if (video) {
          video.currentTime = seconds;
        }
      },
      getCurrentTime: () => playedSeconds,
      getDuration: () => duration,
    }));

    // 加载弹幕数据
    useEffect(() => {
      if (danmakuList) {
        setDanmakuData(danmakuList);
        return;
      }

      if (!danmakuUrl) {
        setDanmakuData([]);
        return;
      }

      const loadDanmaku = async () => {
        try {
          const response = await fetch(danmakuUrl);
          const contentType = response.headers.get("content-type") || "";
          
          if (contentType.includes("application/json") || danmakuUrl.endsWith(".json")) {
            const data = await response.json();
            let list = data;
            if (!Array.isArray(data)) {
              list = data.danmaku || data.danmakus || data.comments || data.data || [];
            }
            if (Array.isArray(list)) {
              setDanmakuData(
                list.map((item: DanmakuItem) => ({
                  text: item.text || "",
                  time: item.time || 0,
                  color: item.color || "#FFFFFF",
                  mode: item.mode ?? 0,
                  size: item.size,
                }))
              );
            }
          } else {
            const text = await response.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, "text/xml");
            const items = xml.querySelectorAll("d");
            const parsed: DanmakuItem[] = [];
            
            items.forEach((item) => {
              const p = item.getAttribute("p")?.split(",") || [];
              const content = item.textContent || "";
              const mode = parseInt(p[1]) || 1;
              
              const danmaku: DanmakuItem = {
                text: content,
                time: parseFloat(p[0]) || 0,
                mode: mode,
                size: parseInt(p[2]) || 25,
                color: p[3] ? `#${parseInt(p[3]).toString(16).padStart(6, "0")}` : "#FFFFFF",
              };
              
              if (mode === 7 && content.startsWith("[")) {
                try {
                  const advData = JSON.parse(content);
                  if (Array.isArray(advData) && advData.length > 0) {
                    danmaku.text = String(advData[0] || "");
                    danmaku.advanced = {
                      startX: typeof advData[1] === "number" ? advData[1] : 50,
                      startY: typeof advData[2] === "number" ? advData[2] : 50,
                      endX: typeof advData[3] === "number" ? advData[3] : undefined,
                      endY: typeof advData[4] === "number" ? advData[4] : undefined,
                      duration: typeof advData[5] === "number" ? advData[5] * 1000 : 4000,
                      rotateZ: typeof advData[6] === "number" ? advData[6] : undefined,
                      fadeStart: typeof advData[7] === "number" ? advData[7] : 1,
                      fadeEnd: typeof advData[8] === "number" ? advData[8] : 1,
                      fontFamily: typeof advData[9] === "string" ? advData[9] : undefined,
                      linear: advData[10] === 1,
                    };
                  }
                } catch {
                  // JSON 解析失败
                }
              }
              
              parsed.push(danmaku);
            });
            
            setDanmakuData(parsed);
          }
        } catch (error) {
          console.error("Failed to load danmaku:", error);
          setDanmakuData([]);
        }
      };

      loadDanmaku();
    }, [danmakuUrl, danmakuList]);

    // 加载字幕数据
    useEffect(() => {
      if (!currentSubtitle?.url) {
        setSubtitleCues([]);
        return;
      }

      const loadSubtitle = async () => {
        try {
          const response = await fetch(currentSubtitle.url);
          const text = await response.text();
          const cues = parseSubtitle(text, currentSubtitle.url);
          setSubtitleCues(cues);
        } catch (error) {
          console.error("Failed to load subtitle:", error);
          setSubtitleCues([]);
        }
      };

      loadSubtitle();
    }, [currentSubtitle]);

    // 更新当前显示的字幕
    useEffect(() => {
      if (!subtitlesEnabled || subtitleCues.length === 0) {
        setCurrentCue("");
        return;
      }

      const currentTime = playedSeconds;
      const cue = subtitleCues.find(
        (c) => currentTime >= c.start && currentTime <= c.end
      );
      setCurrentCue(cue?.text || "");
    }, [playedSeconds, subtitleCues, subtitlesEnabled]);

    // 初始化弹幕渲染器
    useEffect(() => {
      if (!showPlayer || !danmakuContainerRef.current || danmakuData.length === 0) {
        return;
      }

      if (danmakuRendererRef.current) {
        danmakuRendererRef.current.stop();
        danmakuRendererRef.current.clear();
      }

      const renderer = createDanmakuRenderer(danmakuContainerRef.current);

      const comments: DanmakuComment[] = danmakuData.map((item) => ({
        text: item.text,
        stime: item.time * 1000,
        mode: item.mode || 1,
        size: item.size || 25,
        color: parseInt((item.color || "#FFFFFF").replace("#", ""), 16),
        advanced: item.advanced,
      }));

      renderer.load(comments);
      danmakuRendererRef.current = renderer;

      return () => {
        if (danmakuRendererRef.current) {
          danmakuRendererRef.current.stop();
          danmakuRendererRef.current.clear();
          danmakuRendererRef.current = null;
        }
      };
    }, [showPlayer, danmakuData]);

    // 同步弹幕时间
    useEffect(() => {
      if (danmakuRendererRef.current && danmakuEnabled) {
        danmakuRendererRef.current.time(playedSeconds * 1000);
      }
    }, [playedSeconds, danmakuEnabled]);

    // 弹幕播放控制
    useEffect(() => {
      if (!danmakuRendererRef.current) return;

      if (isPlaying && danmakuEnabled) {
        danmakuRendererRef.current.start();
      } else {
        danmakuRendererRef.current.stop();
      }
    }, [isPlaying, danmakuEnabled]);

    // 更新弹幕设置
    useEffect(() => {
      if (danmakuRendererRef.current) {
        danmakuRendererRef.current.setSettings(danmakuSettings);
      }
    }, [danmakuSettings]);

    // 控制栏自动隐藏
    const resetControlsTimeout = useCallback(() => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      setShowControls(true);
      controlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying && !showMobileMenu) {
          setShowControls(false);
        }
      }, 3000);
    }, [isPlaying, showMobileMenu]);

    // 全屏变化监听
    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, []);

    // 获取原生视频元素的音轨
    useEffect(() => {
      if (!isReady) return;

      const checkAudioTracks = () => {
        const video = containerRef.current?.querySelector("video");
        if (video && "audioTracks" in video) {
          const tracks = (video as HTMLVideoElement & { audioTracks: AudioTrackList }).audioTracks;
          if (tracks && tracks.length > 0) {
            const trackList: AudioTrack[] = [];
            for (let i = 0; i < tracks.length; i++) {
              const track = tracks[i];
              trackList.push({
                id: i,
                name: track.label || `音轨 ${i + 1}`,
                language: track.language,
                default: track.enabled,
              });
              if (track.enabled && !currentAudioTrack) {
                setCurrentAudioTrack(trackList[i]);
              }
            }
            setAudioTracks(trackList);
          }
        }
      };

      const timer = setTimeout(checkAudioTracks, 1000);
      return () => clearTimeout(timer);
    }, [isReady, currentAudioTrack]);

    // 切换音轨
    const handleAudioTrackChange = useCallback((track: AudioTrack) => {
      const video = containerRef.current?.querySelector("video");
      if (video && "audioTracks" in video) {
        const tracks = (video as HTMLVideoElement & { audioTracks: AudioTrackList }).audioTracks;
        for (let i = 0; i < tracks.length; i++) {
          tracks[i].enabled = i === track.id;
        }
        setCurrentAudioTrack(track);
      }
    }, []);

    // 切换画质
    const handleQualityChange = useCallback(
      (quality: QualityLevel) => {
        const currentTime = playedSeconds;
        setCurrentQuality(quality);
        setTimeout(() => {
          const video = getVideoElement();
          if (video) {
            video.currentTime = currentTime;
          }
        }, 500);
      },
      [playedSeconds, getVideoElement]
    );

    // 全屏切换
    const toggleFullscreen = useCallback(() => {
      if (!containerRef.current) return;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }, []);

    // 画中画
    const togglePiP = useCallback(async () => {
      const video = containerRef.current?.querySelector("video");
      if (!video) return;
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch (error) {
        console.error("PiP error:", error);
      }
    }, []);

    // 进度条点击
    const handleSeek = useCallback(
      (value: number[]) => {
        const newTime = value[0] * duration;
        const video = getVideoElement();
        if (video) {
          video.currentTime = newTime;
        }
        setPlayed(value[0]);
        setPlayedSeconds(newTime);
      },
      [duration, getVideoElement]
    );

    // 显示手势提示
    const showGestureHint = useCallback((type: string, value: string, icon?: string) => {
      if (gestureHintTimeoutRef.current) {
        clearTimeout(gestureHintTimeoutRef.current);
      }
      setGestureHint({ type, value, icon });
      gestureHintTimeoutRef.current = setTimeout(() => {
        setGestureHint(null);
      }, 1000);
    }, []);

    // 快进/快退
    const skip = useCallback((seconds: number, showHint = false) => {
      const video = containerRef.current?.querySelector("video");
      if (video) {
        const newTime = Math.max(0, Math.min(video.currentTime + seconds, video.duration));
        video.currentTime = newTime;
        if (showHint) {
          const sign = seconds > 0 ? "+" : "";
          showGestureHint("progress", `${sign}${seconds}秒`, seconds > 0 ? "forward" : "backward");
        }
      }
    }, [showGestureHint]);

    // 调整音量
    const adjustVolume = useCallback((delta: number) => {
      setVolume((prev) => {
        const newVol = Math.max(0, Math.min(1, prev + delta));
        if (newVol > 0) setIsMuted(false);
        showGestureHint("volume", `${Math.round(newVol * 100)}%`);
        return newVol;
      });
    }, [showGestureHint]);

    // 键盘快捷键
    useEffect(() => {
      if (!showPlayer || !isReady) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target as HTMLElement).isContentEditable
        ) {
          return;
        }

        const container = containerRef.current;
        if (!container) return;

        const isPlayerFocused = 
          document.fullscreenElement === container ||
          container.contains(document.activeElement) ||
          document.activeElement === document.body;

        if (!isPlayerFocused) return;

        switch (e.key) {
          case " ":
          case "k":
            e.preventDefault();
            setIsPlaying((prev) => !prev);
            break;
          case "ArrowLeft":
            e.preventDefault();
            skip(e.shiftKey ? -10 : -5, true);
            break;
          case "ArrowRight":
            e.preventDefault();
            skip(e.shiftKey ? 10 : 5, true);
            break;
          case "ArrowUp":
            e.preventDefault();
            adjustVolume(0.1);
            break;
          case "ArrowDown":
            e.preventDefault();
            adjustVolume(-0.1);
            break;
          case "m":
          case "M":
            e.preventDefault();
            setIsMuted((prev) => !prev);
            break;
          case "f":
          case "F":
            e.preventDefault();
            toggleFullscreen();
            break;
          case "Escape":
            if (document.fullscreenElement) {
              document.exitFullscreen();
            }
            break;
          case "j":
          case "J":
            e.preventDefault();
            skip(-10, true);
            break;
          case "l":
          case "L":
            e.preventDefault();
            skip(10, true);
            break;
          case "0":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9":
            e.preventDefault();
            const percent = parseInt(e.key) / 10;
            const video = getVideoElement();
            if (video && video.duration) {
              video.currentTime = video.duration * percent;
              showGestureHint("progress", `${parseInt(e.key) * 10}%`);
            }
            break;
          case ",":
            e.preventDefault();
            setPlaybackRate((prev) => {
              const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
              const idx = rates.indexOf(prev);
              const newRate = rates[Math.max(0, idx - 1)] || prev;
              showGestureHint("speed", `${newRate}x`);
              return newRate;
            });
            break;
          case ".":
            e.preventDefault();
            setPlaybackRate((prev) => {
              const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
              const idx = rates.indexOf(prev);
              const newRate = rates[Math.min(rates.length - 1, idx + 1)] || prev;
              showGestureHint("speed", `${newRate}x`);
              return newRate;
            });
            break;
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [showPlayer, isReady, skip, adjustVolume, toggleFullscreen, getVideoElement, showGestureHint]);

    const handlePlay = useCallback(() => setShowPlayer(true), []);

    // 鼠标双击处理（桌面端）
    const lastClickRef = useRef<number>(0);
    const handleVideoClick = useCallback((e: React.MouseEvent) => {
      if (isMobile || isLocked) return;
      if ((e.target as HTMLElement).closest("[data-controls]")) return;
      
      const now = Date.now();
      const timeSinceLastClick = now - lastClickRef.current;
      
      if (timeSinceLastClick < 300) {
        toggleFullscreen();
        lastClickRef.current = 0;
      } else {
        lastClickRef.current = now;
        setTimeout(() => {
          if (Date.now() - lastClickRef.current >= 300) {
            setIsPlaying((prev) => !prev);
          }
        }, 300);
      }
    }, [toggleFullscreen, isMobile, isLocked]);

    // 触摸开始
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      if (isLocked) {
        // 锁定时只允许单击解锁按钮区域
        return;
      }
      
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      touchMoveRef.current = null;
      gestureActiveRef.current = "none";
      isLongPressingRef.current = false;
      
      gestureStartValueRef.current = playedSeconds;
      
      // 长按检测（快进模式）
      longPressTimerRef.current = setTimeout(() => {
        isLongPressingRef.current = true;
        setPlaybackRate(2);
        showGestureHint("speed", "2x 快进中...", "fastforward");
      }, 500);
    }, [playedSeconds, isLocked, showGestureHint]);

    // 触摸移动
    const handleTouchMove = useCallback((e: React.TouchEvent) => {
      if (isLocked) return;
      if (!touchStartRef.current || e.touches.length !== 1) return;
      
      // 取消长按
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      
      // 如果在长按快进中，不处理滑动
      if (isLongPressingRef.current) return;
      
      const touch = e.touches[0];
      const container = containerRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      const startX = touchStartRef.current.x;
      const startY = touchStartRef.current.y;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      
      if (gestureActiveRef.current === "none") {
        const threshold = 20;
        if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
          gestureActiveRef.current = "progress";
          gestureStartValueRef.current = playedSeconds;
        } else if (Math.abs(deltaY) > threshold && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
          const isLeftSide = startX < rect.left + rect.width / 2;
          if (isLeftSide) {
            gestureActiveRef.current = "brightness";
          } else {
            gestureActiveRef.current = "volume";
            gestureStartValueRef.current = volume;
          }
        }
      }
      
      touchMoveRef.current = { x: touch.clientX, y: touch.clientY };
      
      if (gestureActiveRef.current === "progress") {
        // 进度调整：每滑动宽度的 1/3 对应视频总长的 1/4
        const seekDelta = (deltaX / (rect.width / 3)) * (duration / 4);
        const newTime = Math.max(0, Math.min(duration, gestureStartValueRef.current + seekDelta));
        const video = getVideoElement();
        if (video) {
          video.currentTime = newTime;
        }
        const sign = seekDelta >= 0 ? "+" : "";
        showGestureHint("progress", `${formatTime(newTime)} (${sign}${Math.round(seekDelta)}秒)`, seekDelta >= 0 ? "forward" : "backward");
        e.preventDefault();
      } else if (gestureActiveRef.current === "volume") {
        const volumeDelta = -(deltaY / (rect.height / 2)) * 0.5;
        const newVol = Math.max(0, Math.min(1, gestureStartValueRef.current + volumeDelta));
        setVolume(newVol);
        if (newVol > 0) setIsMuted(false);
        showGestureHint("volume", `${Math.round(newVol * 100)}%`);
        e.preventDefault();
      } else if (gestureActiveRef.current === "brightness") {
        const brightnessDelta = -(deltaY / (rect.height / 2)) * 50;
        const newBrightness = Math.max(0, Math.min(100, 50 + brightnessDelta));
        showGestureHint("brightness", `${Math.round(newBrightness)}%`);
        e.preventDefault();
      }
    }, [duration, playedSeconds, volume, getVideoElement, showGestureHint, isLocked]);

    // 触摸结束
    const handleTouchEnd = useCallback(() => {
      if (isLocked) {
        touchStartRef.current = null;
        return;
      }
      
      // 取消长按计时器
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      
      // 结束长按快进
      if (isLongPressingRef.current) {
        isLongPressingRef.current = false;
        setPlaybackRate(1);
        setGestureHint(null);
        touchStartRef.current = null;
        touchMoveRef.current = null;
        gestureActiveRef.current = "none";
        return;
      }
      
      const touchStart = touchStartRef.current;
      const touchMove = touchMoveRef.current;
      
      if (!touchStart) return;
      
      const now = Date.now();
      const touchDuration = now - touchStart.time;
      
      // 如果没有移动且是快速点击，检测双击
      if (!touchMove && touchDuration < 300 && gestureActiveRef.current === "none") {
        const lastTap = lastTapRef.current;
        
        if (lastTap && now - lastTap.time < 300) {
          // 双击检测
          const container = containerRef.current;
          if (container) {
            const rect = container.getBoundingClientRect();
            const tapX = touchStart.x - rect.left;
            const width = rect.width;
            
            if (tapX < width / 3) {
              // 双击左侧：快退 10 秒
              skip(-10, true);
            } else if (tapX > (width * 2) / 3) {
              // 双击右侧：快进 10 秒
              skip(10, true);
            } else {
              // 双击中间：播放/暂停
              setIsPlaying(prev => !prev);
            }
          }
          lastTapRef.current = null;
        } else {
          // 单击：显示/隐藏控制栏
          lastTapRef.current = { time: now, x: touchStart.x };
          setTimeout(() => {
            if (lastTapRef.current && Date.now() - lastTapRef.current.time >= 300) {
              setShowControls((prev) => !prev);
              if (!showControls) {
                resetControlsTimeout();
              }
              lastTapRef.current = null;
            }
          }, 300);
        }
      }
      
      touchStartRef.current = null;
      touchMoveRef.current = null;
      gestureActiveRef.current = "none";
      
      if (gestureHintTimeoutRef.current) {
        clearTimeout(gestureHintTimeoutRef.current);
      }
      gestureHintTimeoutRef.current = setTimeout(() => {
        setGestureHint(null);
      }, 500);
    }, [skip, showControls, resetControlsTimeout, isLocked]);

    const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];

    // 服务端渲染时显示骨架屏
    if (!isMounted) {
      return (
        <div className="aspect-video bg-black rounded-lg overflow-hidden">
          <Skeleton className="w-full h-full" />
        </div>
      );
    }

    if (hasError) {
      return (
        <div className="aspect-video bg-muted flex flex-col items-center justify-center rounded-lg gap-2">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">视频加载失败</p>
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            尝试直接打开
          </a>
        </div>
      );
    }

    // 封面预览
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
            <div className="w-16 h-16 md:w-20 md:h-20 bg-white/90 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
              <Play className="w-8 h-8 md:w-10 md:h-10 text-black ml-1" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className={cn(
          "relative aspect-video bg-black rounded-lg overflow-hidden group select-none touch-none",
          isFullscreen && "rounded-none"
        )}
        tabIndex={0}
        onMouseMove={!isMobile ? resetControlsTimeout : undefined}
        onMouseLeave={!isMobile ? () => isPlaying && setShowControls(false) : undefined}
        onClick={handleVideoClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 加载骨架屏 */}
        <div
          className={cn(
            "absolute inset-0 z-10 transition-opacity duration-300",
            isReady ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
        >
          <Skeleton className="w-full h-full" />
        </div>

        {/* React Player */}
        <ReactPlayer
          ref={playerRef}
          src={currentUrl}
          width="100%"
          height="100%"
          playing={isPlaying}
          muted={isMuted}
          volume={volume}
          playbackRate={playbackRate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={onEnded}
          onError={() => setHasError(true)}
          onWaiting={() => setIsBuffering(true)}
          onCanPlay={() => {
            setIsBuffering(false);
            if (!isReady) {
              setIsReady(true);
              if (initialProgress > 0) {
                const video = getVideoElement();
                if (video && video.currentTime < 1) {
                  video.currentTime = initialProgress;
                }
              }
            }
          }}
          onLoadedData={() => {
            if (!isReady) {
              setIsReady(true);
            }
          }}
          onDurationChange={(e) => setDuration((e.target as HTMLVideoElement).duration || 0)}
          onTimeUpdate={(e) => {
            const video = e.target as HTMLVideoElement;
            if (video.duration) {
              const state = {
                played: video.currentTime / video.duration,
                playedSeconds: video.currentTime,
                loaded: 0,
                loadedSeconds: 0,
              };
              setPlayed(state.played);
              setPlayedSeconds(state.playedSeconds);
              onProgress?.(state);
            }
          }}
        />

        {/* 弹幕层 */}
        <div
          ref={danmakuContainerRef}
          className={cn(
            "absolute inset-0 pointer-events-none overflow-hidden",
            !danmakuEnabled && "hidden"
          )}
        >
          <style>{`
            @keyframes danmaku-scroll {
              from { transform: translateX(0); }
              to { transform: translateX(calc(-100% - 100vw)); }
            }
            @keyframes danmaku-scroll-reverse {
              from { transform: translateX(0); }
              to { transform: translateX(calc(100% + 100vw)); }
            }
            @keyframes danmaku-fade {
              0% { opacity: 1; }
              80% { opacity: 1; }
              100% { opacity: 0; }
            }
          `}</style>
        </div>

        {/* 字幕层 */}
        {subtitlesEnabled && currentCue && (
          <div className={cn(
            "absolute left-0 right-0 flex justify-center pointer-events-none z-20 px-4",
            isMobile ? "bottom-20" : "bottom-16"
          )}>
            <div 
              className="bg-black/75 text-white px-4 py-2 rounded-lg text-center max-w-[90%]"
              style={{
                fontSize: isMobile ? "0.9em" : "1.1em",
                lineHeight: 1.5,
                textShadow: "1px 1px 2px rgba(0,0,0,0.5)",
                fontFamily: '"Microsoft YaHei", "SimHei", "Noto Sans SC", sans-serif',
              }}
              dangerouslySetInnerHTML={{ __html: currentCue.replace(/\n/g, "<br/>") }}
            />
          </div>
        )}

        {/* 手势提示 */}
        {gestureHint && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
            <div className="bg-black/80 text-white px-6 py-4 rounded-2xl text-center backdrop-blur-sm">
              {gestureHint.icon === "forward" && (
                <RotateCw className="h-8 w-8 mx-auto mb-2 animate-spin" style={{ animationDuration: "1s" }} />
              )}
              {gestureHint.icon === "backward" && (
                <RotateCcw className="h-8 w-8 mx-auto mb-2 animate-spin" style={{ animationDuration: "1s", animationDirection: "reverse" }} />
              )}
              {gestureHint.icon === "fastforward" && (
                <div className="flex items-center justify-center gap-1 mb-2">
                  <ChevronRight className="h-6 w-6 animate-pulse" />
                  <ChevronRight className="h-6 w-6 animate-pulse" style={{ animationDelay: "0.1s" }} />
                </div>
              )}
              {!gestureHint.icon && (
                <div className="text-sm opacity-75 mb-1">
                  {gestureHint.type === "progress" && "进度"}
                  {gestureHint.type === "volume" && "音量"}
                  {gestureHint.type === "brightness" && "亮度"}
                  {gestureHint.type === "speed" && "速度"}
                </div>
              )}
              <div className="text-xl font-medium">{gestureHint.value}</div>
            </div>
          </div>
        )}

        {/* 缓冲指示器 */}
        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
            <Loader2 className="w-12 h-12 text-white animate-spin" />
          </div>
        )}

        {/* 中央播放按钮 */}
        {!isPlaying && isReady && !isLocked && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
              <Play className="w-8 h-8 md:w-10 md:h-10 text-black ml-1" />
            </div>
          </div>
        )}

        {/* 锁定按钮（移动端全屏时显示） */}
        {isMobile && isFullscreen && (
          <button
            className={cn(
              "absolute left-4 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-black/50 text-white transition-opacity",
              (showControls || isLocked) ? "opacity-100" : "opacity-0"
            )}
            onClick={(e) => {
              e.stopPropagation();
              setIsLocked(!isLocked);
              if (!isLocked) {
                setShowControls(false);
              }
            }}
          >
            {isLocked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
          </button>
        )}

        {/* 锁定提示 */}
        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="text-white/50 text-sm">点击左侧锁图标解锁</div>
          </div>
        )}

        {/* 移动端控制栏 */}
        {isMobile ? (
          <div
            data-controls
            className={cn(
              "absolute inset-x-0 bottom-0 transition-all duration-300 z-20",
              showControls && !isLocked ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none"
            )}
            onClick={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {/* 渐变背景 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
            
            <div className="relative p-3 pb-safe">
              {/* 进度条 */}
              <div className="mb-3">
                <Slider
                  value={[played]}
                  max={1}
                  step={0.001}
                  onValueChange={handleSeek}
                  className="cursor-pointer [&_[role=slider]]:h-5 [&_[role=slider]]:w-5"
                />
                <div className="flex justify-between text-xs text-white/70 mt-1 px-1">
                  <span>{formatTime(playedSeconds)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* 控制按钮 */}
              <div className="flex items-center justify-between">
                {/* 左侧 */}
                <div className="flex items-center gap-1">
                  {/* 快退 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 h-12 w-12"
                    onClick={() => skip(-10)}
                  >
                    <RotateCcw className="h-5 w-5" />
                  </Button>

                  {/* 播放/暂停 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 h-14 w-14"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 ml-0.5" />}
                  </Button>

                  {/* 快进 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 h-12 w-12"
                    onClick={() => skip(10)}
                  >
                    <RotateCw className="h-5 w-5" />
                  </Button>
                </div>

                {/* 右侧 */}
                <div className="flex items-center gap-1">
                  {/* 弹幕开关 */}
                  {danmakuData.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "text-white hover:bg-white/20 h-10 w-10",
                        !danmakuEnabled && "opacity-50"
                      )}
                      onClick={() => setDanmakuEnabled(!danmakuEnabled)}
                    >
                      <MessageSquare className="h-5 w-5" />
                    </Button>
                  )}

                  {/* 更多设置 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 h-10 w-10"
                    onClick={() => setShowMobileMenu(!showMobileMenu)}
                  >
                    <Settings className="h-5 w-5" />
                  </Button>

                  {/* 全屏 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 h-10 w-10"
                    onClick={toggleFullscreen}
                  >
                    {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* 移动端菜单面板 */}
            {showMobileMenu && (
              <div 
                className="absolute bottom-full left-0 right-0 bg-black/95 backdrop-blur-sm max-h-[50vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 space-y-4">
                  {/* 播放速度 */}
                  <div>
                    <div className="text-sm text-white/70 mb-2">播放速度</div>
                    <div className="flex flex-wrap gap-2">
                      {playbackRates.map((rate) => (
                        <button
                          key={rate}
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm",
                            playbackRate === rate
                              ? "bg-primary text-primary-foreground"
                              : "bg-white/10 text-white"
                          )}
                          onClick={() => {
                            setPlaybackRate(rate);
                            setShowMobileMenu(false);
                          }}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 画质选择 */}
                  {qualities.length > 0 && (
                    <div>
                      <div className="text-sm text-white/70 mb-2">画质</div>
                      <div className="flex flex-wrap gap-2">
                        {qualities.map((q) => (
                          <button
                            key={q.url}
                            className={cn(
                              "px-4 py-2 rounded-lg text-sm",
                              currentQuality?.url === q.url
                                ? "bg-primary text-primary-foreground"
                                : "bg-white/10 text-white"
                            )}
                            onClick={() => {
                              handleQualityChange(q);
                              setShowMobileMenu(false);
                            }}
                          >
                            {q.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 字幕选择 */}
                  {subtitles.length > 0 && (
                    <div>
                      <div className="text-sm text-white/70 mb-2">字幕</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={cn(
                            "px-4 py-2 rounded-lg text-sm",
                            !subtitlesEnabled
                              ? "bg-primary text-primary-foreground"
                              : "bg-white/10 text-white"
                          )}
                          onClick={() => {
                            setSubtitlesEnabled(false);
                            setShowMobileMenu(false);
                          }}
                        >
                          关闭
                        </button>
                        {subtitles.map((sub) => (
                          <button
                            key={sub.url}
                            className={cn(
                              "px-4 py-2 rounded-lg text-sm",
                              subtitlesEnabled && currentSubtitle?.url === sub.url
                                ? "bg-primary text-primary-foreground"
                                : "bg-white/10 text-white"
                            )}
                            onClick={() => {
                              setCurrentSubtitle(sub);
                              setSubtitlesEnabled(true);
                              setShowMobileMenu(false);
                            }}
                          >
                            {sub.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 弹幕设置 */}
                  {danmakuData.length > 0 && (
                    <div>
                      <div className="text-sm text-white/70 mb-2">弹幕设置</div>
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-xs text-white/50 mb-1">
                            <span>透明度</span>
                            <span>{Math.round(danmakuSettings.opacity * 100)}%</span>
                          </div>
                          <Slider
                            value={[danmakuSettings.opacity]}
                            min={0.1}
                            max={1}
                            step={0.1}
                            onValueChange={(v) => setDanmakuSettings({ ...danmakuSettings, opacity: v[0] })}
                            className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-white/50 mb-1">
                            <span>字体大小</span>
                            <span>{Math.round(danmakuSettings.scale * 100)}%</span>
                          </div>
                          <Slider
                            value={[danmakuSettings.scale]}
                            min={0.5}
                            max={2}
                            step={0.1}
                            onValueChange={(v) => setDanmakuSettings({ ...danmakuSettings, scale: v[0] })}
                            className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 关闭按钮 */}
                <button
                  className="w-full py-3 text-center text-white/70 border-t border-white/10"
                  onClick={() => setShowMobileMenu(false)}
                >
                  关闭
                </button>
              </div>
            )}
          </div>
        ) : (
          /* 桌面端控制栏 */
          <div
            data-controls
            className={cn(
              "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300",
              showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
            onClick={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {/* 进度条 */}
            <div className="mb-3">
              <Slider
                value={[played]}
                max={1}
                step={0.001}
                onValueChange={handleSeek}
                className="cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              {/* 左侧控制 */}
              <div className="flex items-center gap-2">
                {/* 播放/暂停 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>

                {/* 快退 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => skip(-10)}
                >
                  <SkipBack className="h-4 w-4" />
                </Button>

                {/* 快进 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => skip(10)}
                >
                  <SkipForward className="h-4 w-4" />
                </Button>

                {/* 音量 */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="h-5 w-5" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </Button>
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    max={1}
                    step={0.01}
                    onValueChange={(v) => {
                      setVolume(v[0]);
                      setIsMuted(v[0] === 0);
                    }}
                    className="w-20"
                  />
                </div>

                {/* 时间 */}
                <span className="text-white text-sm ml-2">
                  {formatTime(playedSeconds)} / {formatTime(duration)}
                </span>
              </div>

              {/* 右侧控制 */}
              <div className="flex items-center gap-1">
                {/* 弹幕开关 */}
                {danmakuData.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "text-white hover:bg-white/20",
                      !danmakuEnabled && "opacity-50"
                    )}
                    onClick={() => setDanmakuEnabled(!danmakuEnabled)}
                    title={danmakuEnabled ? "关闭弹幕" : "开启弹幕"}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                )}

                {/* 设置菜单 */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {/* 画质选择 */}
                    {qualities.length > 0 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Layers className="h-4 w-4 mr-2" />
                          画质 ({currentQuality?.name || "自动"})
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {qualities.map((q) => (
                            <DropdownMenuCheckboxItem
                              key={q.url}
                              checked={currentQuality?.url === q.url}
                              onCheckedChange={() => handleQualityChange(q)}
                            >
                              {q.name}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

                    {/* 音轨选择 */}
                    {audioTracks.length > 1 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <AudioLines className="h-4 w-4 mr-2" />
                          音轨 ({currentAudioTrack?.name || "默认"})
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {audioTracks.map((track) => (
                            <DropdownMenuCheckboxItem
                              key={track.id}
                              checked={currentAudioTrack?.id === track.id}
                              onCheckedChange={() => handleAudioTrackChange(track)}
                            >
                              {track.name}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

                    {/* 字幕选择 */}
                    {subtitles.length > 0 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Subtitles className="h-4 w-4 mr-2" />
                          字幕 ({subtitlesEnabled ? currentSubtitle?.name : "关闭"})
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuCheckboxItem
                            checked={!subtitlesEnabled}
                            onCheckedChange={() => setSubtitlesEnabled(false)}
                          >
                            关闭
                          </DropdownMenuCheckboxItem>
                          {subtitles.map((sub) => (
                            <DropdownMenuCheckboxItem
                              key={sub.url}
                              checked={subtitlesEnabled && currentSubtitle?.url === sub.url}
                              onCheckedChange={() => {
                                setCurrentSubtitle(sub);
                                setSubtitlesEnabled(true);
                              }}
                            >
                              {sub.name}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

                    {/* 播放速度 */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>播放速度 ({playbackRate}x)</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {playbackRates.map((rate) => (
                          <DropdownMenuCheckboxItem
                            key={rate}
                            checked={playbackRate === rate}
                            onCheckedChange={() => setPlaybackRate(rate)}
                          >
                            {rate}x
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    {/* 弹幕设置 */}
                    {danmakuData.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <MessageSquare className="h-4 w-4 mr-2" />
                            弹幕设置
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-64 p-3">
                            <div className="space-y-4">
                              {/* 透明度 */}
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-xs text-muted-foreground">透明度</span>
                                  <span className="text-xs">{Math.round(danmakuSettings.opacity * 100)}%</span>
                                </div>
                                <Slider
                                  value={[danmakuSettings.opacity]}
                                  min={0.1}
                                  max={1}
                                  step={0.1}
                                  onValueChange={(v) => setDanmakuSettings({ ...danmakuSettings, opacity: v[0] })}
                                />
                              </div>

                              {/* 字体大小 */}
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-xs text-muted-foreground">字体大小</span>
                                  <span className="text-xs">{Math.round(danmakuSettings.scale * 100)}%</span>
                                </div>
                                <Slider
                                  value={[danmakuSettings.scale]}
                                  min={0.5}
                                  max={2}
                                  step={0.1}
                                  onValueChange={(v) => setDanmakuSettings({ ...danmakuSettings, scale: v[0] })}
                                />
                              </div>

                              {/* 弹幕速度 */}
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-xs text-muted-foreground">弹幕速度</span>
                                  <span className="text-xs">{danmakuSettings.speed}x</span>
                                </div>
                                <Slider
                                  value={[danmakuSettings.speed]}
                                  min={0.5}
                                  max={2}
                                  step={0.25}
                                  onValueChange={(v) => setDanmakuSettings({ ...danmakuSettings, speed: v[0] })}
                                />
                              </div>

                              {/* 显示区域 */}
                              <div>
                                <span className="text-xs text-muted-foreground block mb-2">显示区域</span>
                                <div className="flex gap-1">
                                  {[
                                    { value: 0.25, label: "1/4" },
                                    { value: 0.5, label: "1/2" },
                                    { value: 0.75, label: "3/4" },
                                    { value: 1, label: "全屏" },
                                  ].map((opt) => (
                                    <button
                                      key={opt.value}
                                      className={`flex-1 py-1 text-xs rounded ${
                                        danmakuSettings.area === opt.value
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted hover:bg-muted/80"
                                      }`}
                                      onClick={() => setDanmakuSettings({ ...danmakuSettings, area: opt.value })}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* 弹幕密度 */}
                              <div>
                                <span className="text-xs text-muted-foreground block mb-2">弹幕密度</span>
                                <div className="flex gap-1">
                                  {[
                                    { value: "unlimited" as const, label: "不限" },
                                    { value: "normal" as const, label: "适中" },
                                    { value: "less" as const, label: "较少" },
                                  ].map((opt) => (
                                    <button
                                      key={opt.value}
                                      className={`flex-1 py-1 text-xs rounded ${
                                        danmakuSettings.density === opt.value
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted hover:bg-muted/80"
                                      }`}
                                      onClick={() => setDanmakuSettings({ ...danmakuSettings, density: opt.value })}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* 弹幕类型过滤 */}
                              <div>
                                <span className="text-xs text-muted-foreground block mb-2">弹幕类型</span>
                                <div className="flex flex-wrap gap-2">
                                  {[
                                    { key: "scroll" as const, label: "滚动" },
                                    { key: "top" as const, label: "顶部" },
                                    { key: "bottom" as const, label: "底部" },
                                    { key: "advanced" as const, label: "高级" },
                                  ].map((opt) => (
                                    <button
                                      key={opt.key}
                                      className={`px-2 py-1 text-xs rounded ${
                                        danmakuSettings.typeFilter[opt.key]
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted/50 text-muted-foreground"
                                      }`}
                                      onClick={() =>
                                        setDanmakuSettings({
                                          ...danmakuSettings,
                                          typeFilter: {
                                            ...danmakuSettings.typeFilter,
                                            [opt.key]: !danmakuSettings.typeFilter[opt.key],
                                          },
                                        })
                                      }
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* 画中画 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={togglePiP}
                >
                  <PictureInPicture2 className="h-4 w-4" />
                </Button>

                {/* 全屏 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize className="h-4 w-4" />
                  ) : (
                    <Maximize className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

// AudioTrackList 类型
interface AudioTrackList {
  length: number;
  [index: number]: {
    enabled: boolean;
    label: string;
    language: string;
  };
}
