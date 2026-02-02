import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../trpc";
import { getCache, setCache, deleteCachePattern } from "@/lib/redis";

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

export const tagRouter = router({
  // 根据 slug 获取标签
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
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

      const tag = await ctx.prisma.tag.findUnique({
        where: { slug: input.slug },
        include: {
          _count: { select: { videos: true } },
        },
      });

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
      })
    )
    .query(async ({ ctx, input }) => {
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

      const tags = await ctx.prisma.tag.findMany({
        take: input.limit,
        where: input.search
          ? {
              name: { contains: input.search, mode: "insensitive" },
            }
          : undefined,
        include: {
          _count: { select: { videos: true } },
        },
        orderBy: { name: "asc" },
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
    .query(async ({ ctx, input }) => {
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

      const tags = await ctx.prisma.tag.findMany({
        take: input.limit,
        include: {
          _count: { select: { videos: true } },
        },
        orderBy: {
          videos: { _count: "desc" },
        },
      });

      // 写入缓存
      await setCache(cacheKey, tags, CACHE_TTL.popular);

      return tags;
    }),

  // 创建标签
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(30),
        slug: z.string().min(1).max(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.prisma.tag.create({
        data: input,
      });

      // 清除标签相关缓存
      await deleteCachePattern("tag:*");

      return tag;
    }),

  // 删除标签
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.tag.delete({
        where: { id: input.id },
      });

      // 清除标签相关缓存
      await deleteCachePattern("tag:*");

      return { success: true };
    }),
});
