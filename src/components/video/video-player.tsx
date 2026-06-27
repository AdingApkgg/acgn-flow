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
import { useIsMounted } from "@/components/motion";

// 判断是否 HLS(m3u8)源：Safari/iOS 可原生播放，其余浏览器用 hls.js 接管
function isHlsSource(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url);
}

// 仅"自动播放被浏览器拦截"(NotAllowedError) 才回退暂停态；
// load()/seek 打断 play() 抛出的 AbortError 属正常，忽略以免误翻转播放意图。
function isAutoplayBlocked(e: unknown): boolean {
  return e instanceof DOMException && e.name === "NotAllowedError";
}

// 第三方解析（B站等）加载失败时的自动重试上限
const MAX_AUTO_RETRY = 2;

// 字幕设置接口（B站同款）
interface SubtitleSettings {
  fontSize: "small" | "medium" | "large" | "xlarge";
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  position: "bottom" | "top";
  offset: number; // 时间偏移（秒）
}

// 默认字幕设置
const defaultSubtitleSettings: SubtitleSettings = {
  fontSize: "medium",
  fontColor: "#FFFFFF",
  backgroundColor: "#000000",
  backgroundOpacity: 0.75,
  strokeColor: "#000000",
  strokeWidth: 1,
  position: "bottom",
  offset: 0,
};

// 字幕字体大小映射
const subtitleFontSizes = {
  small: { desktop: "0.9em", mobile: "0.75em" },
  medium: { desktop: "1.1em", mobile: "0.9em" },
  large: { desktop: "1.4em", mobile: "1.1em" },
  xlarge: { desktop: "1.8em", mobile: "1.4em" },
};

// 预设字幕颜色
const subtitleColorPresets = [
  { name: "白色", value: "#FFFFFF" },
  { name: "黄色", value: "#FFD700" },
  { name: "青色", value: "#00FFFF" },
  { name: "绿色", value: "#00FF00" },
  { name: "粉色", value: "#FF69B4" },
  { name: "橙色", value: "#FFA500" },
];

// 预设背景样式
const subtitleBackgroundPresets = [
  { name: "半透明", opacity: 0.75 },
  { name: "较透明", opacity: 0.5 },
  { name: "轻透明", opacity: 0.25 },
  { name: "无背景", opacity: 0 },
];

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

// CommentCoreLibrary 弹幕渲染器（B站同款弹幕引擎）
// CCL 通过全局变量暴露，需要通过 script 标签加载
let cclLoadPromise: Promise<boolean> | null = null;

// 动态加载 CommentCoreLibrary（通过 script 标签）
async function loadCCL(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  
  // 检查是否已加载
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).CommentManager) {
    return true;
  }
  
  // 如果正在加载，等待加载完成
  if (cclLoadPromise) {
    return cclLoadPromise;
  }
  
  // 开始加载
  cclLoadPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = "/ccl.min.js";
    script.async = true;
    
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).CommentManager) {
        console.log("[CCL] CommentCoreLibrary loaded successfully");
        resolve(true);
      } else {
        console.warn("[CCL] Script loaded but CommentManager not found");
        resolve(false);
      }
    };
    
    script.onerror = () => {
      console.warn("[CCL] Failed to load script, using CSS fallback");
      resolve(false);
    };
    
    document.head.appendChild(script);
  });
  
  return cclLoadPromise;
}

// CSS 动画回退弹幕渲染器（当 CCL 不可用时使用）
function createFallbackRenderer(container: HTMLElement): DanmakuRenderer {
  let comments: DanmakuComment[] = [];
  let currentTime = 0;
  let isRunning = false;
  let settings: DanmakuSettings = { ...defaultDanmakuSettings };
  let animationId: number | null = null;
  const activeElements = new Set<HTMLElement>();
  const renderedTimes = new Set<number>();
  let renderedInSecond = 0;
  let lastSecond = 0;

  const trackCount = 15;
  const tracks: number[] = new Array(trackCount).fill(0);
  const bottomTracks: number[] = new Array(5).fill(0);
  const topTracks: number[] = new Array(5).fill(0);

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

  const getAvailableTrack = (trackArray: number[], now: number): number => {
    for (let i = 0; i < trackArray.length; i++) {
      if (trackArray[i] <= now) return i;
    }
    let minIndex = 0;
    for (let i = 1; i < trackArray.length; i++) {
      if (trackArray[i] < trackArray[minIndex]) minIndex = i;
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
      case 3: {
        const effectiveTrackCount = Math.floor(trackCount * areaMultiplier);
        const track = getAvailableTrack(tracks.slice(0, effectiveTrackCount), currentTime);
        const trackHeight = (100 * areaMultiplier) / effectiveTrackCount;
        el.style.top = `${track * trackHeight}%`;
        el.style.right = "-100%";
        el.style.animation = `danmaku-scroll ${baseDuration}ms linear forwards`;
        tracks[track] = currentTime + baseDuration;
        break;
      }
      case 4: {
        const duration = 4000 / speedMultiplier;
        const effectiveBottom = 15 + (1 - areaMultiplier) * 40;
        const track = getAvailableTrack(bottomTracks, currentTime);
        el.style.bottom = `${effectiveBottom + track * 8}%`;
        el.style.left = "50%";
        el.style.transform = "translateX(-50%)";
        el.style.animation = `danmaku-fade ${duration}ms ease-out forwards`;
        bottomTracks[track] = currentTime + duration;
        baseDuration = duration;
        break;
      }
      case 5: {
        const duration = 4000 / speedMultiplier;
        const track = getAvailableTrack(topTracks, currentTime);
        el.style.top = `${5 + track * 8}%`;
        el.style.left = "50%";
        el.style.transform = "translateX(-50%)";
        el.style.animation = `danmaku-fade ${duration}ms ease-out forwards`;
        topTracks[track] = currentTime + duration;
        baseDuration = duration;
        break;
      }
      case 6: {
        const track = getAvailableTrack(tracks, currentTime);
        const trackHeight = 100 / trackCount;
        el.style.top = `${track * trackHeight}%`;
        el.style.left = "-100%";
        el.style.animation = `danmaku-scroll-reverse ${baseDuration}ms linear forwards`;
        tracks[track] = currentTime + baseDuration;
        break;
      }
      default: {
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

  return {
    load: (newComments) => {
      comments = newComments.sort((a, b) => a.stime - b.stime);
      renderedTimes.clear();
    },
    time: (ms) => {
      const wasJump = Math.abs(ms - currentTime) > 2000;
      currentTime = ms;
      if (wasJump) {
        renderedTimes.clear();
      }
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

// CCL 弹幕渲染器包装（带回退）
function createDanmakuRenderer(container: HTMLElement): DanmakuRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let commentManager: any = null;
  let fallbackRenderer: DanmakuRenderer | null = null;
  let settings: DanmakuSettings = { ...defaultDanmakuSettings };
  let isInitialized = false;
  let useFallback = false;
  let pendingComments: DanmakuComment[] = [];
  let isRunning = false;
  let lastTime = 0;

  // 初始化 CCL 或回退到 CSS 渲染器
  const initCCL = async () => {
    const loaded = await loadCCL();
    if (!loaded) {
      console.log("[CCL] Using CSS fallback renderer");
      useFallback = true;
      fallbackRenderer = createFallbackRenderer(container);
      isInitialized = true;
      
      // 应用待处理的操作
      if (pendingComments.length > 0) {
        fallbackRenderer.load(pendingComments);
      }
      fallbackRenderer.setSettings(settings);
      if (isRunning) {
        fallbackRenderer.time(lastTime);
        fallbackRenderer.start();
      }
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const CM = (window as any).CommentManager;
      commentManager = new CM(container);
      commentManager.init();
      
      // 应用初始设置
      applySettings();
      
      // 如果有待加载的弹幕，现在加载
      if (pendingComments.length > 0) {
        loadCommentsToManager(pendingComments);
      }
      
      // 如果之前已经开始播放，现在继续
      if (isRunning) {
        commentManager.time(lastTime);
        commentManager.start();
      }
      
      isInitialized = true;
      console.log("[CCL] CommentManager initialized successfully");
    } catch (error) {
      console.error("[CCL] Failed to initialize CommentManager:", error);
      useFallback = true;
      fallbackRenderer = createFallbackRenderer(container);
      isInitialized = true;
      
      if (pendingComments.length > 0) {
        fallbackRenderer.load(pendingComments);
      }
      fallbackRenderer.setSettings(settings);
      if (isRunning) {
        fallbackRenderer.time(lastTime);
        fallbackRenderer.start();
      }
    }
  };

  // 根据设置过滤弹幕
  const filterComments = (comments: DanmakuComment[]): DanmakuComment[] => {
    let filtered = comments.filter((comment) => {
      // 类型过滤
      const mode = comment.mode;
      if (mode === 1 || mode === 2 || mode === 3) {
        // 滚动弹幕 (1=从右到左, 2=从左到右, 3=从右到左)
        if (!settings.typeFilter.scroll) return false;
      } else if (mode === 4) {
        // 底部弹幕
        if (!settings.typeFilter.bottom) return false;
      } else if (mode === 5) {
        // 顶部弹幕
        if (!settings.typeFilter.top) return false;
      } else if (mode === 6 || mode === 7 || mode === 8) {
        // 高级弹幕
        if (!settings.typeFilter.advanced) return false;
      }
      
      // 屏蔽词过滤
      if (settings.blockList.length > 0) {
        const text = comment.text.toLowerCase();
        for (const word of settings.blockList) {
          if (text.includes(word.toLowerCase())) return false;
        }
      }
      
      return true;
    });
    
    // 密度控制（与B站相同逻辑）
    if (settings.density !== "unlimited") {
      // 按时间分组，限制每秒弹幕数
      const maxPerSecond = settings.density === "normal" ? 10 : 5;
      const grouped = new Map<number, DanmakuComment[]>();
      
      filtered.forEach((comment) => {
        const second = Math.floor(comment.stime / 1000);
        if (!grouped.has(second)) {
          grouped.set(second, []);
        }
        grouped.get(second)!.push(comment);
      });
      
      filtered = [];
      grouped.forEach((comments) => {
        // 保留前 N 条（按原始顺序）
        filtered.push(...comments.slice(0, maxPerSecond));
      });
      
      // 按时间重新排序
      filtered.sort((a, b) => a.stime - b.stime);
    }
    
    return filtered;
  };

  // 将弹幕数据转换为 CCL 格式并加载
  const loadCommentsToManager = (comments: DanmakuComment[]) => {
    if (!commentManager) return;
    
    // 应用过滤
    const filtered = filterComments(comments);
    
    // CCL 原生格式
    const cclComments = filtered.map((comment) => ({
      mode: comment.mode,
      stime: comment.stime,
      text: comment.text,
      size: comment.size * settings.scale,
      color: comment.color,
      border: false,
      shadow: true,
    }));

    commentManager.load(cclComments);
  };

  // 应用设置到 CCL
  const applySettings = () => {
    if (!commentManager) return;

    try {
      // 设置透明度和缩放
      if (commentManager.options) {
        commentManager.options.global.opacity = settings.opacity;
        commentManager.options.global.scale = settings.scale;
        
        // 弹幕速度：speed 值越大弹幕越快，CCL 的 scroll.scale 需要反向
        // B站默认速度约 144px/s，这里用 scale 调整
        commentManager.options.scroll.scale = 1 / settings.speed;
        
        // 设置显示区域（B站风格：通过限制弹幕轨道数实现）
        // area=1 为全屏，area=0.25 为 1/4 屏
        const maxLines = Math.max(1, Math.floor(15 * settings.area));
        commentManager.options.limit = maxLines;
        
        // 设置弹幕存活时间（与B站相同，默认约4秒）
        if (commentManager.options.scroll) {
          commentManager.options.scroll.life = 4000 / settings.speed;
        }
      }
    } catch (error) {
      console.warn("[CCL] Failed to apply settings:", error);
    }
  };

  // 立即开始初始化
  initCCL();

  return {
    load: (comments: DanmakuComment[]) => {
      pendingComments = comments.sort((a, b) => a.stime - b.stime);
      if (useFallback && fallbackRenderer) {
        fallbackRenderer.load(pendingComments);
      } else if (isInitialized && commentManager) {
        loadCommentsToManager(pendingComments);
      }
    },
    time: (ms: number) => {
      lastTime = ms;
      if (useFallback && fallbackRenderer) {
        fallbackRenderer.time(ms);
      } else if (commentManager && isInitialized) {
        commentManager.time(ms);
      }
    },
    start: () => {
      isRunning = true;
      if (useFallback && fallbackRenderer) {
        fallbackRenderer.start();
      } else if (commentManager && isInitialized) {
        commentManager.start();
      }
    },
    stop: () => {
      isRunning = false;
      if (useFallback && fallbackRenderer) {
        fallbackRenderer.stop();
      } else if (commentManager && isInitialized) {
        commentManager.stop();
      }
    },
    clear: () => {
      if (useFallback && fallbackRenderer) {
        fallbackRenderer.clear();
      } else if (commentManager && isInitialized) {
        commentManager.clear();
      }
    },
    setSettings: (newSettings: Partial<DanmakuSettings>) => {
      settings = { ...settings, ...newSettings };
      if (useFallback && fallbackRenderer) {
        fallbackRenderer.setSettings(settings);
      } else if (commentManager && isInitialized) {
        applySettings();
        // 如果正在运行，重新启动以应用新设置
        if (isRunning) {
          commentManager.stop();
          if (pendingComments.length > 0) {
            loadCommentsToManager(pendingComments);
          }
          commentManager.time(lastTime);
          commentManager.start();
        }
      }
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
  getDanmakuData: () => DanmakuItem[];
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
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<import("hls.js").default | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const danmakuContainerRef = useRef<HTMLDivElement>(null);
    const danmakuRendererRef = useRef<DanmakuRenderer | null>(null);
    const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 是否已恢复上次播放进度（与具体就绪事件解耦，避免事件竞争丢失）
    const didResumeRef = useRef(false);
    
    // 触摸操作相关
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const touchMoveRef = useRef<{ x: number; y: number } | null>(null);
    const lastTapRef = useRef<{ time: number; x: number } | null>(null);
    const gestureActiveRef = useRef<"none" | "progress" | "volume" | "brightness">("none");
    const gestureStartValueRef = useRef<number>(0);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressingRef = useRef(false);
    const previousPlaybackRateRef = useRef<number>(1); // 保存长按前的播放速度
    
    // 手势提示状态
    const [gestureHint, setGestureHint] = useState<{ type: string; value: string; icon?: string } | null>(null);
    const gestureHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 移动端检测
    const isMobile = useIsMobile();

    // 客户端挂载状态
    const isMounted = useIsMounted();

    // 播放器状态
    const [isReady, setIsReady] = useState(false);
    const [hasError, setHasError] = useState(false);
    // 重试计数：变化时强制 <video> 重新挂载并重新发起解析/取流请求
    const [retryKey, setRetryKey] = useState(0);
    const [showPlayer, setShowPlayer] = useState(autoStart || !poster);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(() => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("video-player-volume");
        if (saved) {
          const v = parseFloat(saved);
          if (v >= 0 && v <= 1) return v;
        }
      }
      return 0.7;
    });
    const [played, setPlayed] = useState(0);
    const [playedSeconds, setPlayedSeconds] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isBuffering, setIsBuffering] = useState(false);
    const [buffered, setBuffered] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(() => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("video-player-rate");
        if (saved) {
          const rate = parseFloat(saved);
          if ([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].includes(rate)) return rate;
        }
      }
      return 1;
    });
    const [isLocked, setIsLocked] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [hoverProgress, setHoverProgress] = useState(0);
    const [showHoverTime, setShowHoverTime] = useState(false);
    const [brightness, setBrightness] = useState(1);

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
    const [danmakuSettings, setDanmakuSettings] = useState<DanmakuSettings>(() => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("video-danmaku-settings");
        if (saved) {
          try {
            return { ...defaultDanmakuSettings, ...JSON.parse(saved) };
          } catch { /* ignore */ }
        }
      }
      return defaultDanmakuSettings;
    });

    // 字幕设置状态（B站同款）
    const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(() => {
      // 从 localStorage 读取保存的设置
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("video-subtitle-settings");
        if (saved) {
          try {
            return { ...defaultSubtitleSettings, ...JSON.parse(saved) };
          } catch {
            // ignore
          }
        }
      }
      return defaultSubtitleSettings;
    });

    // 保存字幕设置到 localStorage
    useEffect(() => {
      if (typeof window !== "undefined") {
        localStorage.setItem("video-subtitle-settings", JSON.stringify(subtitleSettings));
      }
    }, [subtitleSettings]);

    // 持久化音量
    useEffect(() => {
      if (typeof window !== "undefined") {
        localStorage.setItem("video-player-volume", String(volume));
      }
    }, [volume]);

    // 持久化播放速度
    useEffect(() => {
      if (typeof window !== "undefined") {
        localStorage.setItem("video-player-rate", String(playbackRate));
      }
    }, [playbackRate]);

    // 持久化弹幕设置
    useEffect(() => {
      if (typeof window !== "undefined") {
        localStorage.setItem("video-danmaku-settings", JSON.stringify(danmakuSettings));
      }
    }, [danmakuSettings]);

    // 当前播放 URL
    const currentUrl = useMemo(() => {
      if (currentQuality) {
        return currentQuality.url;
      }
      return url;
    }, [currentQuality, url]);

    // 播放源/重试变化时重置状态（覆盖 url/分P/画质切换，以及重试时重新武装进度恢复）
    useEffect(() => {
      setIsReady(false);
      setHasError(false);
      setPlayed(0);
      setPlayedSeconds(0);
      setDuration(0);
      didResumeRef.current = false;
    }, [currentUrl, retryKey]);

    // 切换到新视频（url 变化）时清空重试计数，确保新视频可重新自动重试
    useEffect(() => {
      setRetryKey(0);
    }, [url]);

    // 获取内部视频元素
    const getVideoElement = useCallback(() => {
      return videoRef.current ?? (containerRef.current?.querySelector("video") as HTMLVideoElement | null);
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
      getDanmakuData: () => danmakuData,
    }), [playedSeconds, duration, danmakuData, getVideoElement]);

    // 加载看门狗：避免骨架屏永久卡住（onReady/canplay 始终不触发的情况）
    useEffect(() => {
      if (!showPlayer || isReady || hasError) return;
      const timer = setTimeout(() => {
        const video = getVideoElement();
        if (video && video.readyState >= 2) {
          // 已有可播放数据，只是事件没冒上来 → 揭开
          setIsReady(true);
        } else {
          // 真正卡住 → 给出可重试的错误态
          setHasError(true);
        }
      }, 20000);
      return () => clearTimeout(timer);
    }, [showPlayer, currentUrl, retryKey, isReady, hasError, getVideoElement]);

    // 恢复上次播放进度（与 onReady/onCanPlay/onLoadedData 竞争解耦）
    useEffect(() => {
      if (!isReady || initialProgress <= 0) return;
      if (didResumeRef.current) return;
      const video = getVideoElement();
      if (video && video.currentTime < 1) {
        video.currentTime = initialProgress;
      }
      didResumeRef.current = true;
    }, [isReady, initialProgress, getVideoElement]);

    // 绑定播放源：mp4/webm 直接挂 src；HLS(m3u8) 在非 Safari 用 hls.js 接管。
    // retryKey 变化时重跑此 effect → 重新取流，实现"重试"。
    useEffect(() => {
      const video = getVideoElement();
      if (!video) return;

      // Safari/iOS 原生支持 HLS；其余非 HLS 源也直接挂 src
      if (!isHlsSource(currentUrl) || video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = currentUrl;
        video.load();
        return;
      }

      // 非 Safari 的 HLS：动态加载 hls.js 接管
      let destroyed = false;
      import("hls.js")
        .then(({ default: Hls }) => {
          if (destroyed) return;
          if (!Hls.isSupported()) {
            video.src = currentUrl;
            video.load();
            return;
          }
          const hls = new Hls({ enableWorker: true });
          hlsRef.current = hls;
          hls.loadSource(currentUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (!data.fatal) return;
            // 与 mp4 onError 一致：有限次自动重试。重试会触发本 effect 清理（销毁旧实例）
            // 并以新的 retryKey 重跑 → 重新 loadSource。
            if (retryKey < MAX_AUTO_RETRY) {
              setIsReady(false);
              setHasError(false);
              setRetryKey((k) => k + 1);
            } else {
              hls.destroy();
              hlsRef.current = null;
              setHasError(true);
            }
          });
        })
        .catch(() => setHasError(true));

      return () => {
        destroyed = true;
        // 销毁 hls 实例（含 Web Worker），即便处于错误态卸载也不泄漏
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
      // isMounted/showPlayer：<video> 仅在挂载且进入播放器视图后才存在，
      // 必须随其变化重跑，否则元素出现时本 effect 不再触发 → src 永不绑定。
    }, [currentUrl, retryKey, getVideoElement, isMounted, showPlayer]);

    // 同步声明式播放状态到原生 <video>（react-player 原本代劳的部分）
    // 依赖含 currentUrl/retryKey：换源/重试后即便 isPlaying 未变也重新对齐，确保续播。
    useEffect(() => {
      const video = getVideoElement();
      if (!video) return;
      if (isPlaying) {
        video.play().catch((e) => {
          if (isAutoplayBlocked(e)) setIsPlaying(false);
        });
      } else {
        video.pause();
      }
    }, [isPlaying, currentUrl, retryKey, getVideoElement, isMounted, showPlayer]);

    // 同步音量/静音/倍速到原生 <video>（含换源/重试后 load() 重置的重新应用）
    useEffect(() => {
      const video = getVideoElement();
      if (!video) return;
      video.muted = isMuted;
      video.volume = volume;
      video.playbackRate = playbackRate;
    }, [isMuted, volume, playbackRate, currentUrl, retryKey, getVideoElement, isMounted, showPlayer]);

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
          if (!response.ok) {
            setDanmakuData([]);
            return;
          }
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
          if (!response.ok) {
            setSubtitleCues([]);
            return;
          }
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

    // 更新当前显示的字幕（支持时间偏移）
    useEffect(() => {
      if (!subtitlesEnabled || subtitleCues.length === 0) {
         
        setCurrentCue("");
        return;
      }

      const currentTime = playedSeconds + subtitleSettings.offset;
      // 二分查找定位当前字幕
      let lo = 0, hi = subtitleCues.length - 1, found = "";
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const c = subtitleCues[mid];
        if (currentTime < c.start) {
          hi = mid - 1;
        } else if (currentTime > c.end) {
          lo = mid + 1;
        } else {
          found = c.text;
          break;
        }
      }
      setCurrentCue(found);
    }, [playedSeconds, subtitleCues, subtitlesEnabled, subtitleSettings.offset]);

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

    // 缓冲进度跟踪
    useEffect(() => {
      if (!isReady) return;
      const video = getVideoElement();
      if (!video) return;

      const updateBuffered = () => {
        if (video.buffered.length > 0 && video.duration > 0) {
          const end = video.buffered.end(video.buffered.length - 1);
          setBuffered(end / video.duration);
        }
      };

      video.addEventListener("progress", updateBuffered);
      video.addEventListener("loadeddata", updateBuffered);
      updateBuffered();
      return () => {
        video.removeEventListener("progress", updateBuffered);
        video.removeEventListener("loadeddata", updateBuffered);
      };
    }, [isReady, getVideoElement]);

    // 全屏变化监听
    useEffect(() => {
      const handleFullscreenChange = () => {
        const isNowFullscreen = !!document.fullscreenElement;
        setIsFullscreen(isNowFullscreen);
        if (!isNowFullscreen) {
          setIsLocked(false);
          // 退出全屏时解除方向锁定（按钮退出 / 系统返回 / Esc 都会触发）
          (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
        }
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

    // 全屏切换（移动端进入全屏后尝试锁定横屏）
    const toggleFullscreen = useCallback(async () => {
      if (!containerRef.current) return;
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      } else {
        await containerRef.current.requestFullscreen().catch(() => {});
        if (isMobile) {
          // 非标准 API：Android Chrome 可用，iOS Safari / 桌面会 reject 或缺失
          const orientation = screen.orientation as ScreenOrientation & {
            lock?: (o: string) => Promise<void>;
          };
          await orientation?.lock?.("landscape").catch(() => {});
        }
      }
    }, [isMobile]);

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

    // 键盘快捷键 — 外部嵌入时不拦截
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

    // 桌面端点击/双击处理（YouTube 式：单击立即切换播放，双击全屏时会切换两次自动复原）
    const handleVideoClick = useCallback((e: React.MouseEvent) => {
      if (isMobile || isLocked) return;
      if ((e.target as HTMLElement).closest("[data-controls]")) return;
      setIsPlaying((prev) => !prev);
    }, [isMobile, isLocked]);

    const handleVideoDoubleClick = useCallback((e: React.MouseEvent) => {
      if (isMobile || isLocked) return;
      if ((e.target as HTMLElement).closest("[data-controls]")) return;
      toggleFullscreen();
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
        previousPlaybackRateRef.current = playbackRate; // 保存当前播放速度
        setPlaybackRate(2);
        showGestureHint("speed", "2x 快进中...", "fastforward");
      }, 500);
    }, [playedSeconds, isLocked, showGestureHint, playbackRate]);

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
        } else if (isFullscreen && Math.abs(deltaY) > threshold && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
          // 仅全屏时纵向滑动调音量/亮度；非全屏时让位给页面滚动，避免“滚不动”
          const isLeftSide = startX < rect.left + rect.width / 2;
          if (isLeftSide) {
            gestureActiveRef.current = "brightness";
            gestureStartValueRef.current = brightness;
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
        const brightnessDelta = -(deltaY / (rect.height / 2));
        const newBrightness = Math.max(0.2, Math.min(2, gestureStartValueRef.current + brightnessDelta));
        setBrightness(newBrightness);
        showGestureHint("brightness", `${Math.round(newBrightness * 100)}%`);
        e.preventDefault();
      }
    }, [duration, playedSeconds, volume, brightness, getVideoElement, showGestureHint, isLocked, isFullscreen]);

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
        setPlaybackRate(previousPlaybackRateRef.current); // 恢复之前的播放速度
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
      const movedDist = touchMove
        ? Math.hypot(touchMove.x - touchStart.x, touchMove.y - touchStart.y)
        : 0;

      // 轻微抖动（<10px）仍按点击处理，避免“点了没反应”
      if (movedDist < 10 && touchDuration < 300 && gestureActiveRef.current === "none") {
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
          // 单击：立即显示/隐藏控制栏（无 300ms 延迟），双击由上面分支处理
          lastTapRef.current = { time: now, x: touchStart.x };
          setShowControls((prev) => {
            const next = !prev;
            if (next) resetControlsTimeout();
            return next;
          });
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
    }, [skip, resetControlsTimeout, isLocked]);

    // 进度条悬停时间预览
    const handleProgressHover = useCallback((e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = Math.max(0, Math.min(1, x / rect.width));
      setHoverProgress(progress);
      setShowHoverTime(true);
    }, []);

    const handleProgressLeave = useCallback(() => {
      setShowHoverTime(false);
    }, []);

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
        <div className="aspect-video bg-muted flex flex-col items-center justify-center rounded-lg gap-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">视频加载失败</p>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setHasError(false);
                setIsReady(false);
                setRetryKey((k) => k + 1);
              }}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" />
              重试
            </Button>
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              尝试直接打开
            </a>
          </div>
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
          "relative aspect-video bg-black rounded-lg overflow-hidden group select-none",
          // 非全屏时允许纵向滑动滚动页面；全屏时彻底接管手势
          isFullscreen ? "touch-none" : "touch-pan-y",
          isFullscreen && "rounded-none"
        )}
        style={brightness !== 1 ? { filter: `brightness(${brightness})` } : undefined}
        tabIndex={0}
        onMouseMove={!isMobile ? resetControlsTimeout : undefined}
        onMouseLeave={!isMobile ? () => isPlaying && setShowControls(false) : undefined}
        onClick={handleVideoClick}
        onDoubleClick={!isMobile ? handleVideoDoubleClick : undefined}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 加载骨架屏 */}
        <div
          className={cn(
            "absolute inset-0 z-10 pointer-events-none transition-opacity duration-300",
            isReady ? "opacity-0" : "opacity-100"
          )}
        >
          <Skeleton className="w-full h-full" />
        </div>

        {/* 原生 HTML5 视频：mp4/webm 直连，HLS(m3u8) 由 hls.js 接管（见 source effect） */}
        <video
          ref={videoRef}
          className="w-full h-full bg-black object-contain"
          playsInline
          onEnded={() => {
            setIsPlaying(false);
            onEnded?.();
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => {
            // 过滤 load()/seek 引起的瞬时暂停（此时 readyState 很低）：
            // 仅在确有可播放数据且非 seeking 时同步外部/画中画/媒体键的暂停。
            const v = getVideoElement();
            if (v && !v.seeking && v.readyState >= 3) {
              setIsPlaying(false);
            }
          }}
          onError={() => {
            // 第三方解析（B站等）多为瞬时失败（风控/CID/过期）：有限次自动重试
            if (retryKey < MAX_AUTO_RETRY) {
              setIsReady(false);
              setHasError(false);
              setRetryKey((k) => k + 1);
            } else {
              setHasError(true);
            }
          }}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onCanPlay={() => {
            setIsBuffering(false);
            // (重新)加载后重新对齐声明式状态：load() 可能重置音量/倍速并暂停
            const video = getVideoElement();
            if (video) {
              video.muted = isMuted;
              video.volume = volume;
              video.playbackRate = playbackRate;
              if (isPlaying) video.play().catch((e) => {
                if (isAutoplayBlocked(e)) setIsPlaying(false);
              });
            }
            if (!isReady) setIsReady(true);
          }}
          onLoadedData={() => {
            if (!isReady) setIsReady(true);
          }}
          onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => {
            const video = e.currentTarget;
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

        {/* 弹幕层 (CommentCoreLibrary) */}
        <div
          ref={danmakuContainerRef}
          className={cn(
            "absolute inset-0 pointer-events-none overflow-hidden",
            !danmakuEnabled && "hidden"
          )}
        >
          {/* CCL 核心样式（动画回退 keyframes 已在 globals.css 中定义） */}
          <style>{`
            .container {
              position: relative;
              width: 100%;
              height: 100%;
              overflow: hidden;
            }
            .cmt {
              position: absolute;
              white-space: nowrap;
              font-family: "Microsoft YaHei", "SimHei", "Noto Sans SC", sans-serif;
              font-weight: bold;
              line-height: 1.2;
              text-shadow: 
                1px 0 1px rgba(0,0,0,0.8),
                -1px 0 1px rgba(0,0,0,0.8),
                0 1px 1px rgba(0,0,0,0.8),
                0 -1px 1px rgba(0,0,0,0.8);
              pointer-events: none;
              z-index: 1;
            }
            .cmt.r2l { transform: translateX(0); }
            .cmt.l2r { transform: translateX(0); }
            .cmt.top, .cmt.bottom {
              left: 50%;
              transform: translateX(-50%);
            }
            .cmt.bottom { bottom: 10%; }
            .cmt.top { top: 5%; }
            .cmt.abs { transform-origin: center center; }
          `}</style>
        </div>

        {/* 字幕层（B站同款样式） — 外部嵌入时隐藏 */}
        {subtitlesEnabled && currentCue && (
          <div className={cn(
            "absolute left-0 right-0 flex justify-center pointer-events-none z-20 px-4",
            subtitleSettings.position === "top" 
              ? (isMobile ? "top-16" : "top-12")
              : (isMobile ? "bottom-20" : "bottom-16")
          )}>
            <div 
              className="px-3 py-1.5 rounded text-center max-w-[90%]"
              style={{
                fontSize: isMobile 
                  ? subtitleFontSizes[subtitleSettings.fontSize].mobile 
                  : subtitleFontSizes[subtitleSettings.fontSize].desktop,
                lineHeight: 1.6,
                color: subtitleSettings.fontColor,
                backgroundColor: subtitleSettings.backgroundOpacity > 0 
                  ? `${subtitleSettings.backgroundColor}${Math.round(subtitleSettings.backgroundOpacity * 255).toString(16).padStart(2, "0")}`
                  : "transparent",
                textShadow: subtitleSettings.strokeWidth > 0 
                  ? `
                    ${subtitleSettings.strokeWidth}px ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
                    -${subtitleSettings.strokeWidth}px ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
                    ${subtitleSettings.strokeWidth}px -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
                    -${subtitleSettings.strokeWidth}px -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
                    0 ${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
                    0 -${subtitleSettings.strokeWidth}px 0 ${subtitleSettings.strokeColor},
                    ${subtitleSettings.strokeWidth}px 0 0 ${subtitleSettings.strokeColor},
                    -${subtitleSettings.strokeWidth}px 0 0 ${subtitleSettings.strokeColor}
                  `
                  : "none",
                fontFamily: '"Microsoft YaHei", "SimHei", "Noto Sans SC", sans-serif',
                fontWeight: 500,
                letterSpacing: "0.02em",
              }}
              dangerouslySetInnerHTML={{ __html: currentCue.replace(/\n/g, "<br/>") }}
            />
          </div>
        )}

        {/* 手势提示 — 外部嵌入时隐藏 */}
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

        {/* 速度指示器 — 外部嵌入时隐藏 */}
        {playbackRate !== 1 && isReady && !isBuffering && (
          <div className="absolute top-3 right-3 z-20 pointer-events-none">
            <div className="rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white/90 backdrop-blur-sm">
              {playbackRate}x
            </div>
          </div>
        )}

        {/* 缓冲指示器 — 外部嵌入时隐藏 */}
        {isBuffering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
            <Loader2 className="w-12 h-12 text-white animate-spin" />
          </div>
        )}

        {/* 中央播放按钮 — 外部嵌入时隐藏 */}
        {!isPlaying && isReady && !isLocked && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button
              type="button"
              aria-label="播放"
              className="pointer-events-auto w-16 h-16 md:w-20 md:h-20 bg-white/90 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              onClick={(e) => {
                e.stopPropagation();
                setIsPlaying(true);
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setIsPlaying(true);
              }}
            >
              <Play className="w-8 h-8 md:w-10 md:h-10 text-black ml-1" />
            </button>
          </div>
        )}

        {/* 锁定按钮（移动端全屏，或已锁定时显示，避免非全屏锁定后无法解锁） — 外部嵌入时隐藏 */}
        {isMobile && (isFullscreen || isLocked) && (
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

        {/* 锁定提示 — 外部嵌入时隐藏 */}
        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="text-white/50 text-sm">点击左侧锁图标解锁</div>
          </div>
        )}

        {/* 控制栏 — 外部嵌入时隐藏，由 iframe 原生控件接管 */}
        {isMobile ? (
          <>
          {/* 设置面板的点击遮罩：点空白处关闭 */}
          {showMobileMenu && (
            <div
              className="absolute inset-0 z-30"
              onClick={() => setShowMobileMenu(false)}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => {
                e.stopPropagation();
                setShowMobileMenu(false);
              }}
            />
          )}
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
            
            <div className="relative p-3 safe-area-bottom">
              {/* 进度条（含缓冲指示） */}
              <div className="relative mb-3">
                <div
                  className="absolute top-1/2 -translate-y-1/2 left-0 h-1.5 rounded-full bg-white/25 pointer-events-none transition-[width] duration-300"
                  style={{ width: `${buffered * 100}%` }}
                />
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

                  {/* 锁定 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={isLocked ? "解锁" : "锁定"}
                    className="text-white hover:bg-white/20 h-10 w-10"
                    onClick={() => {
                      setIsLocked(!isLocked);
                      if (!isLocked) setShowControls(false);
                    }}
                  >
                    {isLocked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                  </Button>

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
          </div>

          {/* 移动端设置面板（底部抽屉，锚定视口底部，避免横屏被裁切） */}
          {showMobileMenu && (
            <div
              className="absolute inset-x-0 bottom-0 z-40 bg-black/95 backdrop-blur-sm max-h-[80vh] overflow-y-auto rounded-t-2xl safe-area-bottom"
              onClick={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
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
                            }}
                          >
                            {sub.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 字幕样式设置（B站同款） */}
                  {subtitles.length > 0 && subtitlesEnabled && (
                    <div>
                      <div className="text-sm text-white/70 mb-2">字幕样式</div>
                      <div className="space-y-3">
                        {/* 字体大小 */}
                        <div>
                          <div className="text-xs text-white/50 mb-1">字体大小</div>
                          <div className="flex gap-1">
                            {[
                              { value: "small" as const, label: "小" },
                              { value: "medium" as const, label: "中" },
                              { value: "large" as const, label: "大" },
                              { value: "xlarge" as const, label: "特大" },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                className={cn(
                                  "flex-1 py-1.5 text-xs rounded",
                                  subtitleSettings.fontSize === opt.value
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-white/10 text-white"
                                )}
                                onClick={() => setSubtitleSettings({ ...subtitleSettings, fontSize: opt.value })}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 字体颜色 */}
                        <div>
                          <div className="text-xs text-white/50 mb-1">字体颜色</div>
                          <div className="flex gap-2">
                            {subtitleColorPresets.map((color) => (
                              <button
                                key={color.value}
                                className={cn(
                                  "w-8 h-8 rounded-full border-2 transition-all",
                                  subtitleSettings.fontColor === color.value
                                    ? "border-primary scale-110"
                                    : "border-white/20"
                                )}
                                style={{ backgroundColor: color.value }}
                                onClick={() => setSubtitleSettings({ ...subtitleSettings, fontColor: color.value })}
                              />
                            ))}
                          </div>
                        </div>

                        {/* 背景样式 */}
                        <div>
                          <div className="text-xs text-white/50 mb-1">背景样式</div>
                          <div className="flex gap-1">
                            {subtitleBackgroundPresets.map((bg) => (
                              <button
                                key={bg.opacity}
                                className={cn(
                                  "flex-1 py-1.5 text-xs rounded",
                                  subtitleSettings.backgroundOpacity === bg.opacity
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-white/10 text-white"
                                )}
                                onClick={() => setSubtitleSettings({ ...subtitleSettings, backgroundOpacity: bg.opacity })}
                              >
                                {bg.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 显示位置 */}
                        <div>
                          <div className="text-xs text-white/50 mb-1">显示位置</div>
                          <div className="flex gap-1">
                            {[
                              { value: "bottom" as const, label: "底部" },
                              { value: "top" as const, label: "顶部" },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                className={cn(
                                  "flex-1 py-1.5 text-xs rounded",
                                  subtitleSettings.position === opt.value
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-white/10 text-white"
                                )}
                                onClick={() => setSubtitleSettings({ ...subtitleSettings, position: opt.value })}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 时间偏移 */}
                        <div>
                          <div className="flex justify-between text-xs text-white/50 mb-1">
                            <span>时间偏移</span>
                            <span>{subtitleSettings.offset > 0 ? "+" : ""}{subtitleSettings.offset.toFixed(1)}s</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              className="px-3 py-1.5 text-xs bg-white/10 rounded text-white"
                              onClick={() => setSubtitleSettings({ ...subtitleSettings, offset: subtitleSettings.offset - 0.5 })}
                            >
                              -0.5s
                            </button>
                            <button
                              className="px-3 py-1.5 text-xs bg-white/10 rounded text-white"
                              onClick={() => setSubtitleSettings({ ...subtitleSettings, offset: 0 })}
                            >
                              重置
                            </button>
                            <button
                              className="px-3 py-1.5 text-xs bg-white/10 rounded text-white"
                              onClick={() => setSubtitleSettings({ ...subtitleSettings, offset: subtitleSettings.offset + 0.5 })}
                            >
                              +0.5s
                            </button>
                          </div>
                        </div>
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
          </>
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
            {/* 进度条（含缓冲指示 + 悬停预览） */}
            <div
              className="relative mb-3"
              onMouseMove={handleProgressHover}
              onMouseLeave={handleProgressLeave}
            >
              {/* 缓冲进度 */}
              <div
                className="absolute top-1/2 -translate-y-1/2 left-0 h-1 rounded-full bg-white/25 pointer-events-none transition-[width] duration-300"
                style={{ width: `${buffered * 100}%` }}
              />
              {/* 悬停时间提示 */}
              {showHoverTime && duration > 0 && (
                <div
                  className="absolute -top-8 z-10 rounded bg-black/90 px-2 py-1 text-xs text-white pointer-events-none -translate-x-1/2"
                  style={{ left: `${hoverProgress * 100}%` }}
                >
                  {formatTime(hoverProgress * duration)}
                </div>
              )}
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
                      <>
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

                        {/* 字幕样式设置（B站同款） */}
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Settings className="h-4 w-4 mr-2" />
                            字幕样式
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-72 p-3">
                            <div className="space-y-4">
                              {/* 字体大小 */}
                              <div>
                                <span className="text-xs text-muted-foreground block mb-2">字体大小</span>
                                <div className="flex gap-1">
                                  {[
                                    { value: "small" as const, label: "小" },
                                    { value: "medium" as const, label: "中" },
                                    { value: "large" as const, label: "大" },
                                    { value: "xlarge" as const, label: "特大" },
                                  ].map((opt) => (
                                    <button
                                      key={opt.value}
                                      className={`flex-1 py-1.5 text-xs rounded ${
                                        subtitleSettings.fontSize === opt.value
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted hover:bg-muted/80"
                                      }`}
                                      onClick={() => setSubtitleSettings({ ...subtitleSettings, fontSize: opt.value })}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* 字体颜色 */}
                              <div>
                                <span className="text-xs text-muted-foreground block mb-2">字体颜色</span>
                                <div className="flex gap-1.5 flex-wrap">
                                  {subtitleColorPresets.map((color) => (
                                    <button
                                      key={color.value}
                                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                                        subtitleSettings.fontColor === color.value
                                          ? "border-primary scale-110"
                                          : "border-transparent hover:border-muted-foreground/50"
                                      }`}
                                      style={{ backgroundColor: color.value }}
                                      onClick={() => setSubtitleSettings({ ...subtitleSettings, fontColor: color.value })}
                                      title={color.name}
                                    />
                                  ))}
                                </div>
                              </div>

                              {/* 背景样式 */}
                              <div>
                                <span className="text-xs text-muted-foreground block mb-2">背景样式</span>
                                <div className="flex gap-1">
                                  {subtitleBackgroundPresets.map((bg) => (
                                    <button
                                      key={bg.opacity}
                                      className={`flex-1 py-1.5 text-xs rounded ${
                                        subtitleSettings.backgroundOpacity === bg.opacity
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted hover:bg-muted/80"
                                      }`}
                                      onClick={() => setSubtitleSettings({ ...subtitleSettings, backgroundOpacity: bg.opacity })}
                                    >
                                      {bg.name}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* 描边宽度 */}
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-xs text-muted-foreground">描边宽度</span>
                                  <span className="text-xs">{subtitleSettings.strokeWidth}px</span>
                                </div>
                                <Slider
                                  value={[subtitleSettings.strokeWidth]}
                                  min={0}
                                  max={3}
                                  step={0.5}
                                  onValueChange={(v) => setSubtitleSettings({ ...subtitleSettings, strokeWidth: v[0] })}
                                />
                              </div>

                              {/* 字幕位置 */}
                              <div>
                                <span className="text-xs text-muted-foreground block mb-2">显示位置</span>
                                <div className="flex gap-1">
                                  {[
                                    { value: "bottom" as const, label: "底部" },
                                    { value: "top" as const, label: "顶部" },
                                  ].map((opt) => (
                                    <button
                                      key={opt.value}
                                      className={`flex-1 py-1.5 text-xs rounded ${
                                        subtitleSettings.position === opt.value
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted hover:bg-muted/80"
                                      }`}
                                      onClick={() => setSubtitleSettings({ ...subtitleSettings, position: opt.value })}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* 时间偏移 */}
                              <div>
                                <div className="flex justify-between mb-1">
                                  <span className="text-xs text-muted-foreground">时间偏移</span>
                                  <span className="text-xs">{subtitleSettings.offset > 0 ? "+" : ""}{subtitleSettings.offset.toFixed(1)}s</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    className="px-2 py-1 text-xs bg-muted rounded hover:bg-muted/80"
                                    onClick={() => setSubtitleSettings({ ...subtitleSettings, offset: subtitleSettings.offset - 0.5 })}
                                  >
                                    -0.5s
                                  </button>
                                  <Slider
                                    value={[subtitleSettings.offset]}
                                    min={-5}
                                    max={5}
                                    step={0.1}
                                    onValueChange={(v) => setSubtitleSettings({ ...subtitleSettings, offset: v[0] })}
                                    className="flex-1"
                                  />
                                  <button
                                    className="px-2 py-1 text-xs bg-muted rounded hover:bg-muted/80"
                                    onClick={() => setSubtitleSettings({ ...subtitleSettings, offset: subtitleSettings.offset + 0.5 })}
                                  >
                                    +0.5s
                                  </button>
                                </div>
                              </div>

                              {/* 重置按钮 */}
                              <button
                                className="w-full py-1.5 text-xs bg-muted rounded hover:bg-muted/80 text-muted-foreground"
                                onClick={() => setSubtitleSettings(defaultSubtitleSettings)}
                              >
                                恢复默认设置
                              </button>
                            </div>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </>
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
