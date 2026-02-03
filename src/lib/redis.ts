import Redis from "ioredis";
import { env } from "@/env";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

export default redis;

// 缓存工具函数
export async function getCache<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  if (!data) return null;
  return JSON.parse(data) as T;
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds: number = 3600
): Promise<void> {
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
}

export async function deleteCache(key: string): Promise<void> {
  await redis.del(key);
}

/**
 * 使用 SCAN 命令删除匹配模式的缓存键
 * 相比 KEYS 命令，SCAN 不会阻塞 Redis 服务器
 */
export async function deleteCachePattern(pattern: string): Promise<number> {
  let cursor = "0";
  let deletedCount = 0;

  do {
    // SCAN 命令：游标、MATCH 模式、COUNT 每次扫描的数量
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;

    if (keys.length > 0) {
      await redis.del(...keys);
      deletedCount += keys.length;
    }
  } while (cursor !== "0");

  return deletedCount;
}

/**
 * 批量设置缓存（使用 pipeline 提高性能）
 */
export async function setCacheMultiple<T>(
  items: Array<{ key: string; value: T; ttl?: number }>
): Promise<void> {
  const pipeline = redis.pipeline();
  for (const { key, value, ttl = 3600 } of items) {
    pipeline.set(key, JSON.stringify(value), "EX", ttl);
  }
  await pipeline.exec();
}

/**
 * 批量获取缓存（使用 mget 提高性能）
 */
export async function getCacheMultiple<T>(keys: string[]): Promise<(T | null)[]> {
  if (keys.length === 0) return [];
  const results = await redis.mget(...keys);
  return results.map((data) => (data ? (JSON.parse(data) as T) : null));
}

/**
 * 缓存键是否存在
 */
export async function hasCache(key: string): Promise<boolean> {
  const exists = await redis.exists(key);
  return exists === 1;
}

/**
 * 获取缓存剩余 TTL（秒）
 */
export async function getCacheTTL(key: string): Promise<number> {
  return redis.ttl(key);
}
