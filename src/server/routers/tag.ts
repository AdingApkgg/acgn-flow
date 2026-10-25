import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/db/schema";
import { deleteCachePattern, getCache, setCache } from "@/lib/redis";
import { publicProcedure, scopedAdminProcedure } from "../orpc";
import { escapeLike, requiredRow } from "../services/query";

// 缓存键
const CACHE_KEYS = {
  tagBySlug: (slug: string) => `tag:slug:${slug}`,
  tagList: (search: string, limit: number) => `tag:list:${search || "all"}:${limit}`,
  popularTags: (limit: number) => `tag:popular:${limit}`,
};

// 缓存时间（秒）
const CACHE_TTL = {
  tag: 300, // 5 分钟
  list: 300, // 5 分钟
  popular: 600, // 10 分钟（热门标签变化较慢）
};

export const tagRouter = {
  // 根据 slug 获取标签
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .handler(async ({ context, input }) => {
      const cacheKey = CACHE_KEYS.tagBySlug(input.slug);

      // 定义返回类型
      type TagWithCount = {
        id: string;
        name: string;
        slug: string;
        createdAt: Date;
        _count: { videos: number };
      };

      // 尝试从缓存获取
      const cached = await getCache<TagWithCount>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const tag = await context.db.query.tag
        .findFirst({
          extras: (row) => ({
            _count: sql<{
              videos: number;
            }>`json_build_object('videos', (select count(*)::int from "TagOnVideo" as "count_videos" where "count_videos"."tagId" = ${sql`${row.id}`}))`.as(
              "_count",
            ),
          }),
          where: and(eq(schema.tag.slug, input.slug)),
        })
        .then((row) => row ?? null);

      // 写入缓存
      if (tag) {
        await setCache(cacheKey, tag, CACHE_TTL.tag);
      }

      return tag;
    }),

  // 获取所有标签
  list: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .handler(async ({ context, input }) => {
      const cacheKey = CACHE_KEYS.tagList(input.search || "", input.limit);

      // 定义返回类型
      type TagWithCount = {
        id: string;
        name: string;
        slug: string;
        createdAt: Date;
        _count: { videos: number };
      };

      // 尝试从缓存获取（仅当无搜索时缓存）
      if (!input.search) {
        const cached = await getCache<TagWithCount[]>(cacheKey);
        if (cached !== null) {
          return cached;
        }
      }

      const tags = await context.db.query.tag.findMany({
        extras: (row) => ({
          _count: sql<{
            videos: number;
          }>`json_build_object('videos', (select count(*)::int from "TagOnVideo" as "count_videos" where "count_videos"."tagId" = ${sql`${row.id}`}))`.as(
            "_count",
          ),
        }),
        where: input.search
          ? and(ilike(schema.tag.name, `%${escapeLike(input.search)}%`))
          : undefined,
        orderBy: [asc(schema.tag.name), desc(schema.tag.id)],
        limit: input.limit,
      });

      // 仅缓存无搜索条件的结果
      if (!input.search) {
        await setCache(cacheKey, tags, CACHE_TTL.list);
      }

      return tags;
    }),

  // 热门标签
  popular: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .handler(async ({ context, input }) => {
      const cacheKey = CACHE_KEYS.popularTags(input.limit);

      // 定义返回类型
      type TagWithCount = {
        id: string;
        name: string;
        slug: string;
        createdAt: Date;
        _count: { videos: number };
      };

      // 尝试从缓存获取
      const cached = await getCache<TagWithCount[]>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      const tags = await context.db.query.tag.findMany({
        extras: (row) => ({
          _count: sql<{
            videos: number;
          }>`json_build_object('videos', (select count(*)::int from "TagOnVideo" as "count_videos" where "count_videos"."tagId" = ${sql`${row.id}`}))`.as(
            "_count",
          ),
        }),
        orderBy: [
          desc(
            sql`(select count(*) from "TagOnVideo" as "count_videos" where "count_videos"."tagId" = ${schema.tag.id})`,
          ),
          desc(schema.tag.id),
        ],
        limit: input.limit,
      });

      // 写入缓存
      await setCache(cacheKey, tags, CACHE_TTL.popular);

      return tags;
    }),

  // 创建标签
  create: scopedAdminProcedure("tag:manage")
    .input(
      z.object({
        name: z.string().min(1).max(30),
        slug: z.string().min(1).max(30),
      }),
    )
    .handler(async ({ context, input }) => {
      const tag = await context.db
        .insert(schema.tag)
        .values(input)
        .returning()
        .then((rows) => requiredRow(rows));

      // 清除标签相关缓存
      await deleteCachePattern("tag:*");

      return tag;
    }),

  // 删除标签
  delete: scopedAdminProcedure("tag:manage")
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await context.db
        .delete(schema.tag)
        .where(and(eq(schema.tag.id, input.id)))
        .returning()
        .then((rows) => requiredRow(rows));

      // 清除标签相关缓存
      await deleteCachePattern("tag:*");

      return { success: true };
    }),
};
