"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

/**
 * 防抖 Hook
 * @param value 要防抖的值
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的值
 */
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
