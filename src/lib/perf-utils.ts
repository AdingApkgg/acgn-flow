/**
 * 性能优化工具库
 * 包含高性能排序、搜索和处理算法
 */

/**
 * 计数排序优化的弹幕时间排序
 * 适用于弹幕时间（0-N秒，精度到毫秒）
 * 时间复杂度 O(n)，比快排 O(n log n) 更快
 */
export function sortDanmakuByTime<T extends { time: number }>(
  danmakus: T[],
  maxTime = 7200 // 默认最大 2 小时
): T[] {
  const n = danmakus.length;
  if (n <= 1) return danmakus;
  
  // 对于小数组，使用原生排序（开销更低）
  if (n < 1000) {
    return danmakus.slice().sort((a, b) => a.time - b.time);
  }
  
  // 使用桶排序（精度 0.1 秒）
  const bucketCount = maxTime * 10 + 1;
  const buckets: T[][] = new Array(bucketCount);
  
  // 分配到桶中
  for (let i = 0; i < n; i++) {
    const d = danmakus[i];
    const bucketIndex = Math.min(Math.floor(d.time * 10), bucketCount - 1);
    if (!buckets[bucketIndex]) {
      buckets[bucketIndex] = [];
    }
    buckets[bucketIndex].push(d);
  }
  
  // 合并结果
  const result: T[] = new Array(n);
  let index = 0;
  for (let i = 0; i < bucketCount; i++) {
    const bucket = buckets[i];
    if (bucket) {
      // 桶内排序（通常很小）
      if (bucket.length > 1) {
        bucket.sort((a, b) => a.time - b.time);
      }
      for (let j = 0; j < bucket.length; j++) {
        result[index++] = bucket[j];
      }
    }
  }
  
  return result;
}

/**
 * 二分查找弹幕位置
 * 返回第一个 time >= targetTime 的索引
 */
export function binarySearchDanmaku<T extends { time: number }>(
  sortedDanmakus: T[],
  targetTime: number
): number {
  let left = 0;
  let right = sortedDanmakus.length;
  
  while (left < right) {
    const mid = (left + right) >>> 1; // 无符号右移，比 Math.floor 快
    if (sortedDanmakus[mid].time < targetTime) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  
  return left;
}

/**
 * 快速过滤弹幕（使用位掩码优化类型过滤）
 */
export interface DanmakuFilterOptions {
  enableScroll?: boolean;   // 模式 1, 2, 3 (滚动)
  enableTop?: boolean;      // 模式 5 (顶部)
  enableBottom?: boolean;   // 模式 4 (底部)
  enableAdvanced?: boolean; // 模式 7, 8, 9 (高级)
  blockWords?: string[];    // 屏蔽词
  maxPerSecond?: number;    // 每秒最大弹幕数
}

export function filterDanmakus<T extends { time: number; mode?: number; text: string }>(
  danmakus: T[],
  options: DanmakuFilterOptions
): T[] {
  const {
    enableScroll = true,
    enableTop = true,
    enableBottom = true,
    enableAdvanced = true,
    blockWords = [],
    maxPerSecond = Infinity,
  } = options;
  
  // 预编译正则（如果有屏蔽词）
  const blockRegexes = blockWords.length > 0
    ? blockWords.map(word => new RegExp(word, "i"))
    : [];
  
  // 第一遍：类型过滤和屏蔽词过滤
  let filtered = danmakus.filter(d => {
    const mode = d.mode || 1;
    
    // 类型过滤
    if (mode >= 1 && mode <= 3 && !enableScroll) return false;
    if (mode === 4 && !enableBottom) return false;
    if (mode === 5 && !enableTop) return false;
    if (mode >= 7 && !enableAdvanced) return false;
    
    // 屏蔽词过滤
    if (blockRegexes.length > 0) {
      for (const regex of blockRegexes) {
        if (regex.test(d.text)) return false;
      }
    }
    
    return true;
  });
  
  // 第二遍：密度控制
  if (maxPerSecond < Infinity && filtered.length > 0) {
    const result: T[] = [];
    const countPerSecond = new Map<number, number>();
    
    for (const d of filtered) {
      const second = Math.floor(d.time);
      const count = countPerSecond.get(second) || 0;
      
      if (count < maxPerSecond) {
        result.push(d);
        countPerSecond.set(second, count + 1);
      }
    }
    
    filtered = result;
  }
  
  return filtered;
}

/**
 * 高效的字符串哈希（用于去重和索引）
 * 使用 djb2 算法，比 MD5 快得多
 */
export function fastHash(str: string): number {
  let hash = 5381;
  const len = str.length;
  
  for (let i = 0; i < len; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  
  return hash >>> 0; // 转为无符号整数
}

/**
 * 批量处理工具
 * 将大数组分批处理，避免阻塞主线程
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => R,
  batchSize = 1000,
  delayMs = 0
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  
  for (let i = 0; i < items.length; i += batchSize) {
    const end = Math.min(i + batchSize, items.length);
    
    for (let j = i; j < end; j++) {
      results[j] = processor(items[j], j);
    }
    
    // 让出主线程
    if (delayMs > 0 && i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

/**
 * 内存高效的数组去重（基于哈希）
 */
export function uniqueByKey<T>(arr: T[], keyFn: (item: T) => string | number): T[] {
  const seen = new Set<string | number>();
  const result: T[] = [];
  
  for (const item of arr) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  
  return result;
}

/**
 * 节流函数（用于高频事件）
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  wait: number
): T {
  let lastTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return ((...args: unknown[]) => {
    const now = Date.now();
    const remaining = wait - (now - lastTime);
    
    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastTime = now;
      return fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastTime = Date.now();
        timeoutId = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

/**
 * 防抖函数（用于搜索等场景）
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  wait: number
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  const debounced = ((...args: unknown[]) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, wait);
  }) as T & { cancel: () => void };
  
  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  
  return debounced;
}
