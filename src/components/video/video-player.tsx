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
  opacity: number; // 透明度 0-1
  scale: number; // 字体缩放 0.5-2
  speed: number; // 速度 0.5-2 (1为正常)
  area: number; // 显示区域 0.25/0.5/0.75/1 (1为全屏)
  typeFilter: {
    scroll: boolean; // 滚动弹幕
    top: boolean; // 顶部弹幕
    bottom: boolean; // 底部弹幕
    advanced: boolean; // 高级弹幕
  };
  density: "unlimited" | "normal" | "less"; // 密度
  blockList: string[]; // 屏蔽词
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
  stime: number; // 开始时间（毫秒）
  mode: number; // B站模式: 1-3滚动, 4底部, 5顶部, 6逆向, 7高级
  size: number;
  color: number;
  // 高级弹幕属性（B站 mode=7）
  advanced?: {
    startX?: number; // 起始X位置（百分比）
    startY?: number; // 起始Y位置（百分比）
    endX?: number; // 结束X位置（百分比）
    endY?: number; // 结束Y位置（百分比）
    duration?: number; // 持续时间（毫秒）
    rotateX?: number; // X轴旋转
    rotateY?: number; // Y轴旋转
    rotateZ?: number; // Z轴旋转
    fadeStart?: number; // 起始透明度
    fadeEnd?: number; // 结束透明度
    fontFamily?: string; // 字体
    isBorder?: boolean; // 是否有边框
    linear?: boolean; // 是否线性移动
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

// 字幕解析函数（支持 VTT/SRT/ASS）
function parseSubtitle(content: string, url: string): Array<{ start: number; end: number; text: string }> {
  const cues: Array<{ start: number; end: number; text: string }> = [];
  const ext = url.split(".").pop()?.toLowerCase();

  // 解析时间字符串为秒数
  const parseTime = (timeStr: string): number => {
    // VTT/SRT 格式: 00:00:00.000 或 00:00:00,000
    const match = timeStr.match(/(\d+):(\d+):(\d+)[.,](\d+)/);
    if (match) {
      const [, h, m, s, ms] = match;
      return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
    }
    // 简化格式: 00:00.000
    const shortMatch = timeStr.match(/(\d+):(\d+)[.,](\d+)/);
    if (shortMatch) {
      const [, m, s, ms] = shortMatch;
      return parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
    }
    return 0;
  };

  if (ext === "vtt" || content.includes("WEBVTT")) {
    // VTT 格式解析
    const lines = content.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      // 查找时间行
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
    // SRT 格式解析
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
    // ASS/SSA 格式解析
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith("Dialogue:")) {
        const parts = line.substring(9).split(",");
        if (parts.length >= 10) {
          const startStr = parts[1].trim();
          const endStr = parts[2].trim();
          // ASS 时间格式: 0:00:00.00
          const parseAssTime = (t: string): number => {
            const m = t.match(/(\d+):(\d+):(\d+)\.(\d+)/);
            if (m) {
              return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100;
            }
            return 0;
          };
          const start = parseAssTime(startStr);
          const end = parseAssTime(endStr);
          // 文本在第9个逗号之后
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
  const renderedTimes = new Set<number>(); // 防止重复渲染
  let renderedInSecond = 0; // 每秒渲染计数
  let lastSecond = 0;

  // 检查弹幕类型是否被过滤
  const isTypeFiltered = (mode: number): boolean => {
    const { typeFilter } = settings;
    if (mode >= 1 && mode <= 3) return !typeFilter.scroll;
    if (mode === 4) return !typeFilter.bottom;
    if (mode === 5) return !typeFilter.top;
    if (mode === 6) return !typeFilter.scroll; // 逆向也算滚动
    if (mode === 7) return !typeFilter.advanced;
    return !typeFilter.scroll;
  };

  // 检查是否被屏蔽词过滤
  const isBlocked = (text: string): boolean => {
    return settings.blockList.some((word) => text.includes(word));
  };

  // 获取密度限制
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
    
    // 重置每秒计数
    if (currentSecond !== lastSecond) {
      renderedInSecond = 0;
      lastSecond = currentSecond;
    }

    const densityLimit = getDensityLimit();

    // 渲染当前时间点的弹幕
    comments.forEach((comment, index) => {
      const uniqueKey = comment.stime * 10000 + index;
      if (
        comment.stime >= now - 100 &&
        comment.stime < now + 100 &&
        !renderedTimes.has(uniqueKey)
      ) {
        // 类型过滤
        if (isTypeFiltered(comment.mode)) return;
        
        // 屏蔽词过滤
        if (isBlocked(comment.text)) return;
        
        // 密度限制
        if (renderedInSecond >= densityLimit) return;
        
        renderedTimes.add(uniqueKey);
        renderedInSecond++;
        renderComment(comment);
      }
    });

    animationId = requestAnimationFrame(render);
  };

  // 轨道管理（避免弹幕重叠）
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
    // 如果没有空闲轨道，返回最早结束的轨道
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
    const areaMultiplier = settings.area; // 显示区域
    const speedMultiplier = settings.speed; // 速度倍率
    
    // 基础样式
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

    // 基础持续时间（根据速度调整）
    let baseDuration = 8000 / speedMultiplier;

    // B站弹幕模式适配
    switch (comment.mode) {
      case 1: // 普通滚动弹幕（从右到左）
      case 2: // 同上
      case 3: // 同上
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

      case 4: // 底部固定弹幕
        {
          const duration = 4000 / speedMultiplier;
          const effectiveBottom = 15 + (1 - areaMultiplier) * 40; // 根据区域调整底部位置
          const track = getAvailableTrack(bottomTracks, currentTime);
          el.style.bottom = `${effectiveBottom + track * 8}%`;
          el.style.left = "50%";
          el.style.transform = "translateX(-50%)";
          el.style.animation = `danmaku-fade ${duration}ms ease-out forwards`;
          bottomTracks[track] = currentTime + duration;
          baseDuration = duration;
        }
        break;

      case 5: // 顶部固定弹幕
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

      case 6: // 逆向滚动弹幕（从左到右）
        {
          const track = getAvailableTrack(tracks, currentTime);
          const trackHeight = 100 / trackCount;
          el.style.top = `${track * trackHeight}%`;
          el.style.left = "-100%";
          el.style.animation = `danmaku-scroll-reverse ${baseDuration}ms linear forwards`;
          tracks[track] = currentTime + baseDuration;
        }
        break;

      case 7: // 高级弹幕
        if (comment.advanced) {
          const adv = comment.advanced;
          const advDuration = adv.duration || 4000;
          
          // 起始位置
          const startX = adv.startX ?? 50;
          const startY = adv.startY ?? 50;
          el.style.left = `${startX}%`;
          el.style.top = `${startY}%`;
          
          // 字体
          if (adv.fontFamily) {
            el.style.fontFamily = `"${adv.fontFamily}", "Microsoft YaHei", sans-serif`;
          }
          
          // 边框
          if (adv.isBorder) {
            el.style.border = "1px solid currentColor";
            el.style.padding = "2px 4px";
          }
          
          // 透明度
          const fadeStart = adv.fadeStart ?? 1;
          const fadeEnd = adv.fadeEnd ?? 1;
          el.style.opacity = String(fadeStart * settings.opacity);
          
          // 旋转
          const transforms: string[] = ["translate(-50%, -50%)"];
          if (adv.rotateX) transforms.push(`rotateX(${adv.rotateX}deg)`);
          if (adv.rotateY) transforms.push(`rotateY(${adv.rotateY}deg)`);
          if (adv.rotateZ) transforms.push(`rotateZ(${adv.rotateZ}deg)`);
          el.style.transform = transforms.join(" ");
          
          // 移动动画
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
            
            // 清理样式元素
            setTimeout(() => styleEl.remove(), advDuration + 100);
          } else {
            // 只有透明度变化
            el.style.animation = `danmaku-fade ${advDuration}ms ease-out forwards`;
          }
        } else {
          // 没有高级属性，当作普通弹幕处理
          el.style.top = "50%";
          el.style.left = "50%";
          el.style.transform = "translate(-50%, -50%)";
          el.style.animation = `danmaku-fade 4s ease-out forwards`;
        }
        break;

      default:
        // 未知模式，当作滚动弹幕
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

    // 动画结束后移除
    el.addEventListener("animationend", () => {
      el.remove();
      activeElements.delete(el);
    });

    // 备用清理
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
      // 如果时间跳跃较大，清除已渲染记录
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
  name: string; // 如 "1080p", "720p", "480p"
  height?: number;
  default?: boolean;
}

// 弹幕数据接口
export interface DanmakuItem {
  text: string;
  time: number; // 秒
  color?: string;
  mode?: number; // B站模式: 1-3滚动, 4底部, 5顶部, 6逆向, 7高级
  size?: number;
  // 高级弹幕属性（B站 mode=7）
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
    
    // 手势提示状态
    const [gestureHint, setGestureHint] = useState<{ type: string; value: string } | null>(null);
    const gestureHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 客户端挂载状态（避免 hydration mismatch）
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
            // XML 格式解析（B站弹幕格式）
            const text = await response.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, "text/xml");
            const items = xml.querySelectorAll("d");
            const parsed: DanmakuItem[] = [];
            
            items.forEach((item) => {
              const p = item.getAttribute("p")?.split(",") || [];
              const content = item.textContent || "";
              const mode = parseInt(p[1]) || 1;
              
              // B站弹幕 p 属性格式:
              // [0] 时间（秒）
              // [1] 模式: 1-3滚动, 4底部, 5顶部, 6逆向, 7高级, 8代码, 9BAS
              // [2] 字号（一般25）
              // [3] 颜色（十进制）
              // [4] 发送时间戳
              // [5] 弹幕池
              // [6] 发送者ID的CRC32
              // [7] 弹幕ID
              
              const danmaku: DanmakuItem = {
                text: content,
                time: parseFloat(p[0]) || 0,
                mode: mode,
                size: parseInt(p[2]) || 25,
                color: p[3] ? `#${parseInt(p[3]).toString(16).padStart(6, "0")}` : "#FFFFFF",
              };
              
              // 解析高级弹幕（mode=7）
              // B站高级弹幕的内容是一个JSON数组
              if (mode === 7 && content.startsWith("[")) {
                try {
                  const advData = JSON.parse(content);
                  // 高级弹幕格式: [text, startX, startY, endX, endY, duration, rotateZ, fadeStart, fadeEnd, ...]
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
                  // JSON 解析失败，当作普通弹幕处理
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrentCue("");
        return;
      }

      const currentTime = playedSeconds;
      const cue = subtitleCues.find(
        (c) => currentTime >= c.start && currentTime <= c.end
      );
      setCurrentCue(cue?.text || "");
    }, [playedSeconds, subtitleCues, subtitlesEnabled]);

    // 初始化弹幕渲染器（不依赖 danmakuSettings，设置变化通过 setSettings 更新）
    useEffect(() => {
      if (!showPlayer || !danmakuContainerRef.current || danmakuData.length === 0) {
        return;
      }

      // 清理旧的渲染器
      if (danmakuRendererRef.current) {
        danmakuRendererRef.current.stop();
        danmakuRendererRef.current.clear();
      }

      const renderer = createDanmakuRenderer(danmakuContainerRef.current);

      // 转换弹幕格式（保持 B 站原始模式值）
      const comments: DanmakuComment[] = danmakuData.map((item) => ({
        text: item.text,
        stime: item.time * 1000, // 毫秒
        mode: item.mode || 1, // 保持原始模式: 1-3滚动, 4底部, 5顶部, 6逆向, 7高级
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
        if (isPlaying) {
          setShowControls(false);
        }
      }, 3000);
    }, [isPlaying]);

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

      // 延迟检查，等待视频加载
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
        // 画质切换后恢复进度
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
    const showGestureHint = useCallback((type: string, value: string) => {
      if (gestureHintTimeoutRef.current) {
        clearTimeout(gestureHintTimeoutRef.current);
      }
      setGestureHint({ type, value });
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
          showGestureHint("progress", `${sign}${seconds}秒`);
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
        // 忽略在输入框中的按键
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target as HTMLElement).isContentEditable
        ) {
          return;
        }

        // 只有当播放器容器或其子元素获得焦点时才响应
        const container = containerRef.current;
        if (!container) return;

        // 检查是否在全屏模式或焦点在播放器内
        const isPlayerFocused = 
          document.fullscreenElement === container ||
          container.contains(document.activeElement) ||
          document.activeElement === document.body;

        if (!isPlayerFocused) return;

        switch (e.key) {
          case " ": // 空格：播放/暂停
          case "k": // K 键：播放/暂停（YouTube 风格）
            e.preventDefault();
            setIsPlaying((prev) => !prev);
            break;
          case "ArrowLeft": // 左箭头：快退
            e.preventDefault();
            skip(e.shiftKey ? -10 : -5, true);
            break;
          case "ArrowRight": // 右箭头：快进
            e.preventDefault();
            skip(e.shiftKey ? 10 : 5, true);
            break;
          case "ArrowUp": // 上箭头：音量增加
            e.preventDefault();
            adjustVolume(0.1);
            break;
          case "ArrowDown": // 下箭头：音量减少
            e.preventDefault();
            adjustVolume(-0.1);
            break;
          case "m": // M 键：静音切换
          case "M":
            e.preventDefault();
            setIsMuted((prev) => !prev);
            break;
          case "f": // F 键：全屏切换
          case "F":
            e.preventDefault();
            toggleFullscreen();
            break;
          case "Escape": // ESC 键：退出全屏
            if (document.fullscreenElement) {
              document.exitFullscreen();
            }
            break;
          case "j": // J 键：快退 10 秒（YouTube 风格）
          case "J":
            e.preventDefault();
            skip(-10, true);
            break;
          case "l": // L 键：快进 10 秒（YouTube 风格）
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
            // 数字键：跳转到对应百分比
            e.preventDefault();
            const percent = parseInt(e.key) / 10;
            const video = getVideoElement();
            if (video && video.duration) {
              video.currentTime = video.duration * percent;
              showGestureHint("progress", `${parseInt(e.key) * 10}%`);
            }
            break;
          case ",": // < 键：降低播放速度
            e.preventDefault();
            setPlaybackRate((prev) => {
              const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
              const idx = rates.indexOf(prev);
              const newRate = rates[Math.max(0, idx - 1)] || prev;
              showGestureHint("speed", `${newRate}x`);
              return newRate;
            });
            break;
          case ".": // > 键：提高播放速度
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

    // 鼠标双击处理
    const lastClickRef = useRef<number>(0);
    const handleVideoClick = useCallback((e: React.MouseEvent) => {
      // 忽略控制栏区域的点击
      if ((e.target as HTMLElement).closest("[data-controls]")) return;
      
      const now = Date.now();
      const timeSinceLastClick = now - lastClickRef.current;
      
      if (timeSinceLastClick < 300) {
        // 双击：全屏切换
        toggleFullscreen();
        lastClickRef.current = 0; // 重置防止三击
      } else {
        // 单击：播放/暂停（延迟执行，等待可能的双击）
        lastClickRef.current = now;
        setTimeout(() => {
          if (Date.now() - lastClickRef.current >= 300) {
            setIsPlaying((prev) => !prev);
          }
        }, 300);
      }
    }, [toggleFullscreen]);

    // 触摸开始
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      touchMoveRef.current = null;
      gestureActiveRef.current = "none";
      
      // 获取当前值用于手势计算
      gestureStartValueRef.current = playedSeconds;
    }, [playedSeconds]);

    // 触摸移动
    const handleTouchMove = useCallback((e: React.TouchEvent) => {
      if (!touchStartRef.current || e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      const container = containerRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      const startX = touchStartRef.current.x;
      const startY = touchStartRef.current.y;
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      
      // 确定手势类型（仅在首次超过阈值时确定）
      if (gestureActiveRef.current === "none") {
        const threshold = 15;
        if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
          // 水平滑动：调整进度
          gestureActiveRef.current = "progress";
          gestureStartValueRef.current = playedSeconds;
        } else if (Math.abs(deltaY) > threshold && Math.abs(deltaY) > Math.abs(deltaX)) {
          // 垂直滑动：左侧调整亮度，右侧调整音量
          const isLeftSide = startX < rect.left + rect.width / 2;
          if (isLeftSide) {
            gestureActiveRef.current = "brightness"; // 亮度（当前不实现，仅显示提示）
          } else {
            gestureActiveRef.current = "volume";
            gestureStartValueRef.current = volume;
          }
        }
      }
      
      touchMoveRef.current = { x: touch.clientX, y: touch.clientY };
      
      // 执行手势操作
      if (gestureActiveRef.current === "progress") {
        // 进度调整：每 100px 对应 30 秒
        const seekDelta = (deltaX / 100) * 30;
        const newTime = Math.max(0, Math.min(duration, gestureStartValueRef.current + seekDelta));
        const video = getVideoElement();
        if (video) {
          video.currentTime = newTime;
        }
        const sign = seekDelta >= 0 ? "+" : "";
        showGestureHint("progress", `${formatTime(newTime)} (${sign}${Math.round(seekDelta)}秒)`);
      } else if (gestureActiveRef.current === "volume") {
        // 音量调整：每 100px 对应 50%
        const volumeDelta = -(deltaY / 100) * 0.5;
        const newVol = Math.max(0, Math.min(1, gestureStartValueRef.current + volumeDelta));
        setVolume(newVol);
        if (newVol > 0) setIsMuted(false);
        showGestureHint("volume", `${Math.round(newVol * 100)}%`);
      } else if (gestureActiveRef.current === "brightness") {
        // 亮度调整（仅显示提示，实际亮度调整需要 CSS filter）
        const brightnessDelta = -(deltaY / 100) * 50;
        const newBrightness = Math.max(0, Math.min(100, 50 + brightnessDelta));
        showGestureHint("brightness", `${Math.round(newBrightness)}%`);
      }
      
      e.preventDefault(); // 阻止页面滚动
    }, [duration, playedSeconds, volume, getVideoElement, showGestureHint]);

    // 触摸结束
    const handleTouchEnd = useCallback(() => {
      const touchStart = touchStartRef.current;
      const touchMove = touchMoveRef.current;
      
      if (!touchStart) return;
      
      const now = Date.now();
      const touchDuration = now - touchStart.time;
      
      // 如果没有移动且是快速点击，检测双击
      if (!touchMove && touchDuration < 300) {
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
              // 双击中间：全屏切换
              toggleFullscreen();
            }
          }
          lastTapRef.current = null;
        } else {
          // 单击：显示/隐藏控制栏
          lastTapRef.current = { time: now, x: touchStart.x };
          setTimeout(() => {
            if (lastTapRef.current && Date.now() - lastTapRef.current.time >= 300) {
              setShowControls((prev) => !prev);
              lastTapRef.current = null;
            }
          }, 300);
        }
      }
      
      touchStartRef.current = null;
      touchMoveRef.current = null;
      gestureActiveRef.current = "none";
      
      // 延迟清除手势提示
      if (gestureHintTimeoutRef.current) {
        clearTimeout(gestureHintTimeoutRef.current);
      }
      gestureHintTimeoutRef.current = setTimeout(() => {
        setGestureHint(null);
      }, 500);
    }, [skip, toggleFullscreen]);

    const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];

    // 服务端渲染时显示骨架屏（避免 hydration mismatch）
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
            <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <Play className="w-8 h-8 text-black ml-1" />
          </div>
        </div>
      </div>
    );
  }

  return (
      <div
        ref={containerRef}
        className={cn(
          "relative aspect-video bg-black rounded-lg overflow-hidden group select-none",
          isFullscreen && "rounded-none"
        )}
        tabIndex={0}
        onMouseMove={resetControlsTimeout}
        onMouseLeave={() => isPlaying && setShowControls(false)}
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
              // 设置初始进度
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
          {/* 弹幕动画样式 */}
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
          <div className="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none z-20 px-4">
            <div 
              className="bg-black/75 text-white px-4 py-2 rounded-lg text-center max-w-[80%]"
              style={{
                fontSize: "1.1em",
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
            <div className="bg-black/75 text-white px-4 py-2 rounded-lg text-center">
              <div className="text-sm opacity-75 mb-1">
                {gestureHint.type === "progress" && "进度"}
                {gestureHint.type === "volume" && "音量"}
                {gestureHint.type === "brightness" && "亮度"}
                {gestureHint.type === "speed" && "速度"}
              </div>
              <div className="text-lg font-medium">{gestureHint.value}</div>
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
        {!isPlaying && isReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
              <Play className="w-8 h-8 text-black ml-1" />
            </div>
          </div>
        )}

        {/* 控制栏 */}
        <div
          data-controls
          className={cn(
            "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300",
            showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={(e) => e.stopPropagation()} // 阻止事件冒泡到容器
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
                className="text-white hover:bg-white/20 hidden sm:flex"
                onClick={() => skip(-10)}
              >
                <SkipBack className="h-4 w-4" />
              </Button>

              {/* 快进 */}
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 hidden sm:flex"
                onClick={() => skip(10)}
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              {/* 音量 */}
              <div className="hidden sm:flex items-center gap-2">
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
                className="text-white hover:bg-white/20 hidden sm:flex"
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
