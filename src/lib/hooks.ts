"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useInView } from "react-intersection-observer";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";

// 从 usehooks-ts 导出常用 hooks
export {
  useIsMounted,
  useEventListener,
  useOnClickOutside,
  useCopyToClipboard,
  useWindowSize,
  useScrollLock,
  useIsClient,
  useDocumentTitle,
  useInterval,
  useTimeout,
  useToggle,
  useCounter,
  useBoolean,
  useStep,
  useHover,
} from "usehooks-ts";

// ==================== useStableSession ====================
/**
 * 稳定的 Session Hook
 * 包装 useSession，提供统一的 API
 * Session 稳定性主要通过 Service Worker 排除 auth API 缓存和
 * SessionProvider 的 refetchInterval/refetchOnWindowFocus 配置来保证
 */
export function useStableSession() {
  const { data: session, status } = useSession();

  return {
    session,
    status,
    isLoading: status === "loading",
  };
}

// ==================== useInfiniteScroll ====================
// 统一的无限滚动 hook，用于替代各页面重复的 useInView + fetchNextPage 逻辑

interface UseInfiniteScrollOptions {
  /** 是否启用无限滚动 */
  enabled?: boolean;
  /** 触发加载的阈值，0-1 之间的数值 */
  threshold?: number;
  /** 触发加载的距离（像素） */
  rootMargin?: string;
  /** 防抖延迟（毫秒） */
  debounceMs?: number;
}

interface UseInfiniteScrollReturn {
  /** 绑定到观察元素的 ref */
  ref: (node?: Element | null) => void;
  /** 元素是否在视口内 */
  inView: boolean;
}

/**
 * 无限滚动 hook
 * @param fetchNextPage - 加载下一页的函数
 * @param hasNextPage - 是否还有下一页
 * @param isFetchingNextPage - 是否正在加载下一页
 * @param options - 配置选项
 */
export function useInfiniteScroll(
  fetchNextPage: () => void,
  hasNextPage: boolean | undefined,
  isFetchingNextPage: boolean,
  options: UseInfiniteScrollOptions = {}
): UseInfiniteScrollReturn {
  const {
    enabled = true,
    threshold = 0,
    rootMargin = "100px",
    debounceMs = 100,
  } = options;

  const lastFetchTime = useRef(0);

  const { ref, inView } = useInView({
    threshold,
    rootMargin,
    skip: !enabled,
  });

  useEffect(() => {
    if (!enabled) return;
    if (!inView) return;
    if (!hasNextPage) return;
    if (isFetchingNextPage) return;

    // 防抖
    const now = Date.now();
    if (now - lastFetchTime.current < debounceMs) return;
    lastFetchTime.current = now;

    fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage, enabled, debounceMs]);

  return { ref, inView };
}

// ==================== useRequireAuth ====================
// 统一的认证检查 hook，用于替代各页面重复的认证检查和重定向逻辑

interface UseRequireAuthOptions {
  /** 未登录时重定向的 URL，默认为 /login */
  redirectTo?: string;
  /** 是否在 URL 中包含回调地址 */
  includeCallback?: boolean;
  /** 自定义回调 URL */
  callbackUrl?: string;
}

interface UseRequireAuthReturn {
  /** 当前会话 */
  session: ReturnType<typeof useSession>["data"];
  /** 认证状态 */
  status: ReturnType<typeof useSession>["status"];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否已认证 */
  isAuthenticated: boolean;
}

/**
 * 认证检查 hook
 * 自动处理未登录用户的重定向
 */
export function useRequireAuth(
  options: UseRequireAuthOptions = {}
): UseRequireAuthReturn {
  const {
    redirectTo = "/login",
    includeCallback = true,
    callbackUrl,
  } = options;

  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated";

  useEffect(() => {
    if (status === "unauthenticated") {
      let url = redirectTo;
      if (includeCallback) {
        const callback = callbackUrl || pathname;
        url = `${redirectTo}?callbackUrl=${encodeURIComponent(callback)}`;
      }
      router.push(url);
    }
  }, [status, router, redirectTo, includeCallback, callbackUrl, pathname]);

  return {
    session,
    status,
    isLoading,
    isAuthenticated,
  };
}

// ==================== useDeviceInfo ====================
// 统一的设备信息获取 hook

interface DeviceInfo {
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  platform: string;
  cookiesEnabled: boolean;
  doNotTrack: boolean;
  touchSupport: boolean;
  colorDepth: number;
  deviceMemory: number | null;
  hardwareConcurrency: number | null;
  connectionType: string | null;
}

interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface UseDeviceInfoReturn {
  deviceInfo: DeviceInfo | null;
  geoLocation: GeoLocation | null;
  isLoading: boolean;
  error: string | null;
  requestGeoLocation: () => Promise<GeoLocation | null>;
}

/**
 * 设备信息获取 hook
 * 在客户端收集设备信息，用于评论、访问记录等
 */
export function useDeviceInfo(): UseDeviceInfoReturn {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [geoLocation, setGeoLocation] = useState<GeoLocation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 获取设备信息
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const nav = navigator as Navigator & {
        deviceMemory?: number;
        connection?: { effectiveType?: string };
      };

      const info: DeviceInfo = {
        userAgent: nav.userAgent || "",
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
        language: nav.language || "",
        platform: nav.platform || "",
        cookiesEnabled: nav.cookieEnabled ?? false,
        doNotTrack: nav.doNotTrack === "1",
        touchSupport: "ontouchstart" in window || nav.maxTouchPoints > 0,
        colorDepth: window.screen.colorDepth || 24,
        deviceMemory: nav.deviceMemory ?? null,
        hardwareConcurrency: nav.hardwareConcurrency ?? null,
        connectionType: nav.connection?.effectiveType ?? null,
      };

      setDeviceInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取设备信息失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 请求地理位置
  const requestGeoLocation = useCallback(async (): Promise<GeoLocation | null> => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      return null;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location: GeoLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          setGeoLocation(location);
          resolve(location);
        },
        () => {
          resolve(null);
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 300000, // 5 分钟缓存
        }
      );
    });
  }, []);

  return {
    deviceInfo,
    geoLocation,
    isLoading,
    error,
    requestGeoLocation,
  };
}

// ==================== useDebounce ====================
// 防抖 hook

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ==================== useLocalStorage ====================
// 本地存储 hook

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error("Error saving to localStorage:", error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

// ==================== useMounted ====================
// 组件挂载状态 hook - 使用 useSyncExternalStore 避免 effect 中 setState
import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function useMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
}

// ==================== useMediaQuery ====================
// 媒体查询 hook - 使用 useSyncExternalStore 避免 effect 中 setState

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", callback);
      return () => mediaQuery.removeEventListener("change", callback);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
