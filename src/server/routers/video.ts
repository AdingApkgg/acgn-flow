import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { getCache, setCache, deleteCachePattern } from "@/lib/redis";
import { submitVideoToIndexNow, submitVideosToIndexNow } from "@/lib/indexnow";

const VIDEO_CACHE_TTL = 60; // 1 minute
const STATS_CACHE_TTL = 15; // 15 seconds - 短缓存，仅防止并发请求
const SEARCH_SUGGESTIONS_CACHE_TTL = 300; // 5 minutes

export const videoRouter = router({
  // 记录搜索
  recordSearch: publicProcedure
    .input(z.object({
      keyword: z.string().min(1).max(100),
      resultCount: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      // 标准化关键词
      const keyword = input.keyword.trim().toLowerCase();
      if (keyword.length < 2) return { success: true };

      await ctx.prisma.searchRecord.create({
        data: {
          keyword,
          userId: ctx.session?.user?.id,
          resultCount: input.resultCount,
        },
      });

      // 清除热搜缓存
      await deleteCachePattern("search:hot*");

      return { success: true };
    }),

  // 热搜榜
  getHotSearches: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      const cacheKey = "search:hot";
      const cached = await getCache<{ keyword: string; score: number; isHot: boolean }[]>(cacheKey);
      if (cached) return cached;

      // 获取最近 7 天的搜索记录
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // 1. 基于实际搜索记录的热度（时间衰减）
      const searchRecords = await ctx.prisma.searchRecord.groupBy({
        by: ["keyword"],
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
        _count: { keyword: true },
        orderBy: { _count: { keyword: "desc" } },
        take: 50,
      });

      // 2. 基于热门视频的标签
      const hotVideos = await ctx.prisma.video.findMany({
        where: { 
          status: "PUBLISHED",
          createdAt: { gte: sevenDaysAgo },
        },
        select: { 
          views: true,
          tags: {
            include: { tag: { select: { name: true } } },
            take: 3,
          },
        },
        orderBy: { views: "desc" },
        take: 30,
      });

      // 3. 合并计算热度分数
      const scoreMap = new Map<string, { score: number; searchCount: number }>();

      // 搜索记录权重（主要来源）
      searchRecords.forEach((record) => {
        const keyword = record.keyword;
        const searchScore = record._count.keyword * 10; // 每次搜索 10 分
        const existing = scoreMap.get(keyword) || { score: 0, searchCount: 0 };
        scoreMap.set(keyword, {
          score: existing.score + searchScore,
          searchCount: record._count.keyword,
        });
      });

      // 热门视频标签权重
      hotVideos.forEach((video) => {
        video.tags.forEach((t) => {
          const tagName = t.tag.name.toLowerCase();
          const tagScore = Math.log10(video.views + 1) * 5; // 播放量对数权重
          const existing = scoreMap.get(tagName) || { score: 0, searchCount: 0 };
          scoreMap.set(tagName, {
            score: existing.score + tagScore,
            searchCount: existing.searchCount,
          });
        });
      });

      // 4. 过滤和排序
      const hotSearches = Array.from(scoreMap.entries())
        .filter(([keyword]) => keyword.length >= 2 && keyword.length <= 20)
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, input.limit)
        .map(([keyword, data], index) => ({
          keyword,
          score: Math.round(data.score),
          isHot: index < 3 && data.searchCount > 5, // 前 3 且搜索次数 > 5 标记为热门
        }));

      // 5. 如果没有搜索记录，回退到标签热度
      if (hotSearches.length < input.limit) {
        const topTags = await ctx.prisma.tag.findMany({
          select: { name: true },
          orderBy: { videos: { _count: "desc" } },
          take: input.limit - hotSearches.length,
        });

        const existingKeywords = new Set(hotSearches.map(h => h.keyword.toLowerCase()));
        topTags.forEach((tag) => {
          if (!existingKeywords.has(tag.name.toLowerCase())) {
            hotSearches.push({
              keyword: tag.name,
              score: 0,
              isHot: false,
            });
          }
        });
      }

      await setCache(cacheKey, hotSearches, 1800); // 缓存 30 分钟

      return hotSearches;
    }),

  // 搜索建议
  searchSuggestions: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(50),
        limit: z.number().min(1).max(10).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, limit } = input;
      const cacheKey = `search:suggestions:${query.toLowerCase()}`;

      // 尝试从缓存获取
      const cached = await getCache<{ videos: { id: string; title: string }[]; tags: { id: string; name: string; slug: string }[] }>(cacheKey);
      if (cached) return cached;

      // 并行搜索视频标题和标签
      const [videos, tags] = await Promise.all([
        ctx.prisma.video.findMany({
          where: {
            status: "PUBLISHED",
            title: { contains: query, mode: "insensitive" },
          },
          select: { id: true, title: true },
          take: limit,
          orderBy: { views: "desc" },
        }),
        ctx.prisma.tag.findMany({
          where: {
            name: { contains: query, mode: "insensitive" },
          },
          select: { id: true, name: true, slug: true },
          take: 5,
          orderBy: { videos: { _count: "desc" } },
        }),
      ]);

      const result = { videos, tags };
      await setCache(cacheKey, result, SEARCH_SUGGESTIONS_CACHE_TTL);

      return result;
    }),

  // 获取网站公开统计数据
  getPublicStats: publicProcedure.query(async ({ ctx }) => {
    const cacheKey = "stats:public";
    const cached = await getCache<{
      videoCount: number;
      userCount: number;
      tagCount: number;
      totalViews: number;
    }>(cacheKey);

    if (cached) return cached;

    const [videoCount, userCount, tagCount, viewsResult] = await Promise.all([
      ctx.prisma.video.count({ where: { status: "PUBLISHED" } }),
      ctx.prisma.user.count(),
      ctx.prisma.tag.count(),
      ctx.prisma.video.aggregate({
        where: { status: "PUBLISHED" },
        _sum: { views: true },
      }),
    ]);

    const stats = {
      videoCount,
      userCount,
      tagCount,
      totalViews: viewsResult._sum.views || 0,
    };

    await setCache(cacheKey, stats, STATS_CACHE_TTL);
    return stats;
  }),

  // 获取视频列表
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
        tagId: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.enum(["latest", "views", "likes", "recommend"]).default("latest"),
        timeRange: z.enum(["all", "today", "week", "month"]).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, tagId, search, sortBy, timeRange } = input;

      // 计算时间范围
      const getTimeFilter = () => {
        const now = new Date();
        switch (timeRange) {
          case "today":
            return new Date(now.setHours(0, 0, 0, 0));
          case "week":
            return new Date(now.setDate(now.getDate() - 7));
          case "month":
            return new Date(now.setMonth(now.getMonth() - 1));
          default:
            return undefined;
        }
      };
      const timeFilter = getTimeFilter();

      const baseWhere: Prisma.VideoWhereInput = {
        status: "PUBLISHED",
      };

      if (tagId) {
        baseWhere.tags = { some: { tagId } };
      }

      if (search) {
        baseWhere.OR = [
          { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { description: { contains: search, mode: Prisma.QueryMode.insensitive } },
        ];
      }

      if (timeFilter) {
        baseWhere.createdAt = { gte: timeFilter };
      }

      if (sortBy === "recommend") {
        const userId = ctx.session?.user?.id;
        let preferredTagIds: string[] = [];
        let excludeVideoIds: string[] = [];
        let searchKeywords: string[] = [];

        if (userId) {
          const [history, likes, favorites, searchRecords] = await Promise.all([
            ctx.prisma.watchHistory.findMany({
              where: { userId },
              select: { videoId: true },
              orderBy: { updatedAt: "desc" },
              take: 100,
            }),
            ctx.prisma.like.findMany({
              where: { userId },
              select: { videoId: true },
              orderBy: { createdAt: "desc" },
              take: 50,
            }),
            ctx.prisma.favorite.findMany({
              where: { userId },
              select: { videoId: true },
              orderBy: { createdAt: "desc" },
              take: 50,
            }),
            // 获取用户最近的搜索历史
            ctx.prisma.searchRecord.findMany({
              where: { userId },
              select: { keyword: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take: 30,
              distinct: ["keyword"],
            }),
          ]);

          // 提取搜索关键词（按时间衰减加权）
          const now = Date.now();
          const keywordWeights = new Map<string, number>();
          searchRecords.forEach((record) => {
            const daysSince = (now - record.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            const weight = 1 / (1 + daysSince * 0.1); // 时间衰减
            const currentWeight = keywordWeights.get(record.keyword) || 0;
            keywordWeights.set(record.keyword, currentWeight + weight);
          });
          
          // 取权重最高的关键词
          searchKeywords = Array.from(keywordWeights.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([keyword]) => keyword);

          excludeVideoIds = history.map((item) => item.videoId);
          const interactionVideoIds = Array.from(
            new Set([
              ...history.map((item) => item.videoId),
              ...likes.map((item) => item.videoId),
              ...favorites.map((item) => item.videoId),
            ])
          );

          if (interactionVideoIds.length > 0) {
            const interactionTags = await ctx.prisma.tagOnVideo.findMany({
              where: { videoId: { in: interactionVideoIds } },
              select: { tagId: true },
            });

            const tagCounts = new Map<string, number>();
            for (const item of interactionTags) {
              tagCounts.set(item.tagId, (tagCounts.get(item.tagId) || 0) + 1);
            }

            preferredTagIds = Array.from(tagCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([tagId]) => tagId);
          }

          // 根据搜索关键词匹配标签
          if (searchKeywords.length > 0) {
            const matchingTags = await ctx.prisma.tag.findMany({
              where: {
                OR: searchKeywords.map(keyword => ({
                  name: { contains: keyword, mode: "insensitive" as const },
                })),
              },
              select: { id: true },
              take: 10,
            });
            
            // 合并搜索关键词匹配的标签（权重较高）
            matchingTags.forEach(tag => {
              if (!preferredTagIds.includes(tag.id)) {
                preferredTagIds.unshift(tag.id); // 放在前面，优先级更高
              }
            });
            preferredTagIds = preferredTagIds.slice(0, 15);
          }
        }

        const preferredTagSet = new Set(preferredTagIds);
        const takeSize = Math.min(limit * 5, 200);

        // 构建查询条件：如果用户指定了 tagId，使用用户的选择；否则使用推荐标签
        const recommendWhere: Prisma.VideoWhereInput = {
          ...baseWhere,
          ...(excludeVideoIds.length > 0 && {
            id: { notIn: excludeVideoIds },
          }),
        };
        
        // 只有在用户没有选择特定标签时，才使用推荐标签筛选
        if (!tagId && preferredTagIds.length > 0) {
          recommendWhere.tags = { some: { tagId: { in: preferredTagIds } } };
        }

        const videos = await ctx.prisma.video.findMany({
          take: takeSize + 1,
          cursor: cursor ? { id: cursor } : undefined,
          where: recommendWhere,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: {
            uploader: {
              select: { id: true, username: true, nickname: true, avatar: true },
            },
            _count: { select: { likes: true, favorites: true } },
            tags: { select: { tagId: true } },
          },
        });

        let nextCursor: string | undefined;
        if (videos.length > takeSize) {
          const nextItem = videos.pop();
          nextCursor = nextItem?.id;
        }

        const hourSeed = Math.floor(Date.now() / 3600000);
        const hashString = (input: string) => {
          let hash = 0;
          for (let i = 0; i < input.length; i++) {
            hash = (hash << 5) - hash + input.charCodeAt(i);
            hash |= 0;
          }
          return Math.abs(hash);
        };

        const scored = videos.map((video) => {
          const likesCount = video._count?.likes ?? 0;
          const favoritesCount = video._count?.favorites ?? 0;
          const days =
            (Date.now() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          const decay = 1 / (1 + days * 0.05);

          const tagMatchCount =
            preferredTagIds.length > 0
              ? video.tags.filter((tag) => preferredTagSet.has(tag.tagId)).length
              : 0;
          const tagBonus = tagMatchCount * 50;

          // 搜索关键词匹配加分
          let searchBonus = 0;
          if (searchKeywords.length > 0) {
            const titleLower = video.title.toLowerCase();
            searchKeywords.forEach((keyword, index) => {
              if (titleLower.includes(keyword)) {
                // 匹配标题，按关键词优先级加分
                searchBonus += 30 * (1 - index * 0.1);
              }
            });
          }

          const baseScore =
            (video.views + likesCount * 5 + favoritesCount * 10) * decay;

          const randomFactor =
            0.9 + (hashString(`${video.id}-${hourSeed}`) % 21) / 100;

          return { video, score: (baseScore + tagBonus + searchBonus) * randomFactor };
        });

        const ranked = scored
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((item) => item.video);

        // 获取总数量（仅首页请求时计算）
        let totalCount: number | undefined;
        if (!cursor) {
          totalCount = await ctx.prisma.video.count({ where: baseWhere });
        }

        return { videos: ranked, nextCursor, totalCount };
      }

      const orderBy = {
        latest: { createdAt: "desc" as const },
        views: { views: "desc" as const },
        likes: { createdAt: "desc" as const }, // 简化处理
      }[sortBy];

      // 并行获取视频和总数量（仅首页请求时计算总数）
      const [videos, totalCount] = await Promise.all([
        ctx.prisma.video.findMany({
          take: limit + 1,
          cursor: cursor ? { id: cursor } : undefined,
          where: baseWhere,
          orderBy,
          include: {
            uploader: {
              select: { id: true, username: true, nickname: true, avatar: true },
            },
            _count: { select: { likes: true, favorites: true } },
          },
        }),
        cursor ? Promise.resolve(undefined) : ctx.prisma.video.count({ where: baseWhere }),
      ]);

      let nextCursor: string | undefined;
      if (videos.length > limit) {
        const nextItem = videos.pop();
        nextCursor = nextItem?.id;
      }

      return { videos, nextCursor, totalCount };
    }),

  // 获取单个视频
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const cacheKey = `video:${input.id}`;
      const cached = await getCache<typeof video>(cacheKey);
      if (cached) return cached;

      const video = await ctx.prisma.video.findUnique({
        where: { id: input.id, status: "PUBLISHED" },
        include: {
          uploader: {
            select: { id: true, username: true, nickname: true, avatar: true },
          },
          tags: {
            include: { tag: { select: { id: true, name: true, slug: true } } },
          },
          _count: { select: { likes: true, dislikes: true, confused: true, favorites: true } },
        },
      });

      if (!video) {
        throw new TRPCError({ code: "NOT_FOUND", message: "视频不存在" });
      }

      await setCache(cacheKey, video, VIDEO_CACHE_TTL);
      return video;
    }),

  // 获取用户自己的视频列表
  getMyVideos: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
        status: z.enum(["ALL", "PUBLISHED", "PENDING", "REJECTED"]).default("ALL"),
      })
    )
    .query(async ({ ctx, input }) => {
      const videos = await ctx.prisma.video.findMany({
        where: {
          uploaderId: ctx.session.user.id,
          ...(input.status !== "ALL" && { status: input.status as "PUBLISHED" | "PENDING" | "REJECTED" }),
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          tags: {
            include: { tag: { select: { id: true, name: true, slug: true } } },
          },
          _count: { select: { likes: true, favorites: true, comments: true } },
        },
      });

      let nextCursor: string | undefined = undefined;
      if (videos.length > input.limit) {
        const nextItem = videos.pop();
        nextCursor = nextItem!.id;
      }

      return { videos, nextCursor };
    }),

  // 获取单个视频用于编辑（无需 PUBLISHED 状态限制）
  getForEdit: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findUnique({
        where: { id: input.id },
        include: {
          tags: {
            include: { tag: { select: { id: true, name: true, slug: true } } },
          },
        },
      });

      if (!video) {
        throw new TRPCError({ code: "NOT_FOUND", message: "视频不存在" });
      }

      if (video.uploaderId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权编辑此视频" });
      }

      return video;
    }),

  // 增加播放量
  incrementViews: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.video.update({
        where: { id: input.id },
        data: { views: { increment: 1 } },
      });
      await deleteCachePattern(`video:${input.id}`);
      return { success: true };
    }),

  // 批量提交 IndexNow（用于批量导入完成后）
  submitBatchToIndexNow: protectedProcedure
    .input(z.object({ videoIds: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const result = await submitVideosToIndexNow(input.videoIds);
      return result;
    }),

  // 创建视频
  create: protectedProcedure
    .input(
      z.object({
        customId: z.string().regex(/^av\d+$/i, "自定义ID格式必须为 av+数字").optional(), // B站AV号作为ID
        title: z.string().min(1).max(100),
        description: z.string().max(5000).optional(),
        coverUrl: z.string().url().optional().or(z.literal("")),
        videoUrl: z.string().url(),
        subtitleUrl: z.string().url().optional().or(z.literal("")),
        danmakuUrl: z.string().url().optional().or(z.literal("")),
        duration: z.number().optional(),
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(), // 新建标签名称
        pages: z.array(z.object({
          page: z.number(),
          title: z.string(),
          cid: z.number().optional(),
        })).optional(), // B站分P信息
        skipIndexNow: z.boolean().optional(), // 批量导入时跳过 IndexNow
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { customId, tagIds, tagNames, coverUrl, subtitleUrl, danmakuUrl, pages, skipIndexNow, ...data } = input;

      // 如果提供了自定义ID，检查是否已存在
      if (customId) {
        const existing = await ctx.prisma.video.findUnique({
          where: { id: customId.toLowerCase() },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `视频 ${customId.toLowerCase()} 已存在`,
          });
        }
      }

      // 处理新标签（使用 upsert 避免并发冲突）
      const allTagIds: string[] = [...(tagIds || [])];
      if (tagNames && tagNames.length > 0) {
        for (const tagName of tagNames) {
          const slug = tagName
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "") || `tag-${Date.now()}`;
          
          try {
            // 使用 upsert 避免并发创建冲突
            const tag = await ctx.prisma.tag.upsert({
              where: { name: tagName },
              update: {}, // 已存在则不更新
              create: { name: tagName, slug },
            });
            if (!allTagIds.includes(tag.id)) {
              allTagIds.push(tag.id);
            }
          } catch {
            // 如果 upsert 失败（slug 冲突），尝试查找已存在的标签
            const existingTag = await ctx.prisma.tag.findFirst({
              where: { OR: [{ name: tagName }, { slug }] },
            });
            if (existingTag && !allTagIds.includes(existingTag.id)) {
              allTagIds.push(existingTag.id);
            }
          }
        }
      }

      // 去重标签ID
      const uniqueTagIds = [...new Set(allTagIds)];

      const video = await ctx.prisma.video.create({
        data: {
          // 使用自定义ID（如B站AV号）或自动生成
          ...(customId ? { id: customId.toLowerCase() } : {}),
          title: data.title,
          description: data.description,
          videoUrl: data.videoUrl,
          duration: data.duration,
          status: "PUBLISHED", // 直接发布，无需审核
          ...(coverUrl ? { coverUrl } : {}),
          ...(subtitleUrl ? { subtitleUrl } : {}),
          ...(danmakuUrl ? { danmakuUrl } : {}),
          ...(pages && pages.length > 1 ? { pages } : {}), // 只有多P时才保存
          uploader: { connect: { id: ctx.session.user.id } },
          ...(uniqueTagIds.length > 0 
            ? { tags: { create: uniqueTagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) } }
            : {}),
        },
      });

      // 异步提交到 IndexNow（不阻塞响应，批量导入时跳过）
      if (!skipIndexNow) {
        submitVideoToIndexNow(video.id).catch(() => {});
      }

      return video;
    }),

  // 更新视频
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(100).optional(),
        description: z.string().max(5000).optional(),
        coverUrl: z.string().url().optional().or(z.literal("")),
        videoUrl: z.string().url().optional(),
        subtitleUrl: z.string().url().optional().or(z.literal("")),
        danmakuUrl: z.string().url().optional().or(z.literal("")),
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(), // 新建标签名称
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tagIds, tagNames, ...data } = input;

      const video = await ctx.prisma.video.findUnique({
        where: { id },
        select: { uploaderId: true },
      });

      if (!video) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (video.uploaderId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // 更新视频基本信息
      const updated = await ctx.prisma.video.update({
        where: { id },
        data,
      });

      // 更新标签关联
      if (tagIds !== undefined || tagNames !== undefined) {
        // 处理新标签
        const allTagIds: string[] = [...(tagIds || [])];
        if (tagNames && tagNames.length > 0) {
          for (const tagName of tagNames) {
            const slug = tagName
              .toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "");
            
            const existingTag = await ctx.prisma.tag.findFirst({
              where: { OR: [{ name: tagName }, { slug }] },
            });
            
            if (existingTag) {
              if (!allTagIds.includes(existingTag.id)) {
                allTagIds.push(existingTag.id);
              }
            } else {
              const newTag = await ctx.prisma.tag.create({
                data: { name: tagName, slug: slug || `tag-${Date.now()}` },
              });
              allTagIds.push(newTag.id);
            }
          }
        }

        // 删除所有现有标签关联
        await ctx.prisma.tagOnVideo.deleteMany({
          where: { videoId: id },
        });

        // 创建新的标签关联
        if (allTagIds.length > 0) {
          await ctx.prisma.tagOnVideo.createMany({
            data: allTagIds.map((tagId) => ({
              videoId: id,
              tagId,
            })),
          });
        }

        // 清理空标签
        await ctx.prisma.tag.deleteMany({
          where: {
            videos: { none: {} },
          },
        });
      }

      await deleteCachePattern(`video:${id}`);

      // 视频更新后通知搜索引擎重新索引
      submitVideoToIndexNow(id).catch(() => {});

      return updated;
    }),

  // 删除视频（真删除）
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findUnique({
        where: { id: input.id },
        select: { uploaderId: true, tags: { select: { tagId: true } } },
      });

      if (!video) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (video.uploaderId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const tagIds = video.tags.map((t) => t.tagId);

      // 真删除视频（关联记录会通过 CASCADE 自动删除）
      await ctx.prisma.video.delete({ where: { id: input.id } });

      // 清理空标签（没有关联任何视频的标签）
      if (tagIds.length > 0) {
        await ctx.prisma.tag.deleteMany({
          where: {
            id: { in: tagIds },
            videos: { none: {} },
          },
        });
      }

      await deleteCachePattern(`video:${input.id}`);
      return { success: true };
    }),

  // 批量删除视频
  batchDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      // 验证所有视频属于当前用户
      const videos = await ctx.prisma.video.findMany({
        where: {
          id: { in: input.ids },
          uploaderId: ctx.session.user.id,
        },
        select: { id: true, tags: { select: { tagId: true } } },
      });

      if (videos.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "没有找到可删除的视频" });
      }

      const videoIds = videos.map(v => v.id);
      const tagIds = [...new Set(videos.flatMap(v => v.tags.map(t => t.tagId)))];

      // 批量删除
      await ctx.prisma.video.deleteMany({
        where: { id: { in: videoIds } },
      });

      // 清理空标签
      if (tagIds.length > 0) {
        await ctx.prisma.tag.deleteMany({
          where: {
            id: { in: tagIds },
            videos: { none: {} },
          },
        });
      }

      // 清理缓存
      for (const id of videoIds) {
        await deleteCachePattern(`video:${id}`);
      }

      return { success: true, count: videoIds.length };
    }),

  // 点赞
  like: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.like.findUnique({
        where: {
          userId_videoId: {
            userId: ctx.session.user.id,
            videoId: input.videoId,
          },
        },
      });

      if (existing) {
        await ctx.prisma.like.delete({
          where: { id: existing.id },
        });
        return { liked: false };
      }

      // 点赞时移除踩和疑惑
      await Promise.all([
        ctx.prisma.dislike.deleteMany({
          where: { userId: ctx.session.user.id, videoId: input.videoId },
        }),
        ctx.prisma.confused.deleteMany({
          where: { userId: ctx.session.user.id, videoId: input.videoId },
        }),
      ]);

      await ctx.prisma.like.create({
        data: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
        },
      });

      return { liked: true };
    }),

  // 踩
  dislike: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.dislike.findUnique({
        where: {
          userId_videoId: {
            userId: ctx.session.user.id,
            videoId: input.videoId,
          },
        },
      });

      if (existing) {
        await ctx.prisma.dislike.delete({
          where: { id: existing.id },
        });
        return { disliked: false };
      }

      // 踩时移除赞和疑惑
      await Promise.all([
        ctx.prisma.like.deleteMany({
          where: { userId: ctx.session.user.id, videoId: input.videoId },
        }),
        ctx.prisma.confused.deleteMany({
          where: { userId: ctx.session.user.id, videoId: input.videoId },
        }),
      ]);

      await ctx.prisma.dislike.create({
        data: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
        },
      });

      return { disliked: true };
    }),

  // 疑惑
  confused: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.confused.findUnique({
        where: {
          userId_videoId: {
            userId: ctx.session.user.id,
            videoId: input.videoId,
          },
        },
      });

      if (existing) {
        await ctx.prisma.confused.delete({
          where: { id: existing.id },
        });
        return { confused: false };
      }

      // 疑惑时移除赞和踩
      await Promise.all([
        ctx.prisma.like.deleteMany({
          where: { userId: ctx.session.user.id, videoId: input.videoId },
        }),
        ctx.prisma.dislike.deleteMany({
          where: { userId: ctx.session.user.id, videoId: input.videoId },
        }),
      ]);

      await ctx.prisma.confused.create({
        data: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
        },
      });

      return { confused: true };
    }),

  // 收藏
  favorite: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.favorite.findUnique({
        where: {
          userId_videoId: {
            userId: ctx.session.user.id,
            videoId: input.videoId,
          },
        },
      });

      if (existing) {
        await ctx.prisma.favorite.delete({
          where: { id: existing.id },
        });
        return { favorited: false };
      }

      await ctx.prisma.favorite.create({
        data: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
        },
      });

      return { favorited: true };
    }),

  // 检查点赞/踩/疑惑/收藏状态
  getInteractionStatus: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [like, dislike, confused, favorite] = await Promise.all([
        ctx.prisma.like.findUnique({
          where: {
            userId_videoId: {
              userId: ctx.session.user.id,
              videoId: input.videoId,
            },
          },
        }),
        ctx.prisma.dislike.findUnique({
          where: {
            userId_videoId: {
              userId: ctx.session.user.id,
              videoId: input.videoId,
            },
          },
        }),
        ctx.prisma.confused.findUnique({
          where: {
            userId_videoId: {
              userId: ctx.session.user.id,
              videoId: input.videoId,
            },
          },
        }),
        ctx.prisma.favorite.findUnique({
          where: {
            userId_videoId: {
              userId: ctx.session.user.id,
              videoId: input.videoId,
            },
          },
        }),
      ]);

      return {
        liked: !!like,
        disliked: !!dislike,
        confused: !!confused,
        favorited: !!favorite,
      };
    }),

  // 管理员：审核视频
  moderate: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.update({
        where: { id: input.id },
        data: { status: input.status },
      });

      await deleteCachePattern(`video:${input.id}`);

      // 审核通过时通知搜索引擎索引
      if (input.status === "PUBLISHED") {
        submitVideoToIndexNow(input.id).catch(() => {});
      }

      return video;
    }),

  // 获取用户收藏列表
  getFavorites: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const favorites = await ctx.prisma.favorite.findMany({
        where: { userId: ctx.session.user.id },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          video: {
            include: {
              uploader: {
                select: { id: true, username: true, nickname: true, avatar: true },
              },
              _count: { select: { likes: true, favorites: true } },
            },
          },
        },
      });

      let nextCursor: string | undefined = undefined;
      if (favorites.length > input.limit) {
        const nextItem = favorites.pop();
        nextCursor = nextItem!.id;
      }

      return {
        favorites: favorites.map((f) => f.video),
        nextCursor,
      };
    }),

  // 获取观看历史
  getHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const history = await ctx.prisma.watchHistory.findMany({
        where: {
          userId: ctx.session.user.id,
          video: {
            status: "PUBLISHED",
          },
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { updatedAt: "desc" },
        include: {
          video: {
            include: {
              uploader: {
                select: { id: true, username: true, nickname: true, avatar: true },
              },
              _count: { select: { likes: true, favorites: true } },
            },
          },
        },
      });

      let nextCursor: string | undefined = undefined;
      if (history.length > input.limit) {
        const nextItem = history.pop();
        nextCursor = nextItem!.id;
      }

      return {
        history: history
          .filter((h) => h.video !== null)
          .map((h) => ({
            ...h.video,
            watchedAt: h.updatedAt,
            progress: h.progress,
          })),
        nextCursor,
      };
    }),

  // 记录观看历史
  recordHistory: protectedProcedure
    .input(
      z.object({
        videoId: z.string(),
        progress: z.number().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.watchHistory.upsert({
        where: {
          userId_videoId: {
            userId: ctx.session.user.id,
            videoId: input.videoId,
          },
        },
        update: { progress: input.progress },
        create: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
          progress: input.progress,
        },
      });
      return { success: true };
    }),

  // 清空观看历史
  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.watchHistory.deleteMany({
      where: { userId: ctx.session.user.id },
    });
    return { success: true };
  }),

  // 删除单条历史记录
  removeHistoryItem: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.watchHistory.deleteMany({
        where: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
        },
      });
      return { success: true };
    }),

  // 取消收藏
  unfavorite: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.favorite.deleteMany({
        where: {
          userId: ctx.session.user.id,
          videoId: input.videoId,
        },
      });
      return { success: true };
    }),

  // 批量取消收藏
  batchUnfavorite: protectedProcedure
    .input(z.object({ videoIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.favorite.deleteMany({
        where: {
          userId: ctx.session.user.id,
          videoId: { in: input.videoIds },
        },
      });
      return { success: true, count: input.videoIds.length };
    }),

  // 批量删除历史记录
  batchRemoveHistory: protectedProcedure
    .input(z.object({ videoIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.watchHistory.deleteMany({
        where: {
          userId: ctx.session.user.id,
          videoId: { in: input.videoIds },
        },
      });
      return { success: true, count: input.videoIds.length };
    }),

  // 获取推荐视频
  getRecommendations: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
        limit: z.number().min(1).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { videoId, limit } = input;

      // 获取当前视频信息（包括标签和上传者）
      const currentVideo = await ctx.prisma.video.findUnique({
        where: { id: videoId },
        include: {
          tags: { select: { tagId: true } },
        },
      });

      if (!currentVideo) {
        return [];
      }

      const tagIds = currentVideo.tags.map((t) => t.tagId);

      // 推荐算法：
      // 1. 优先推荐具有相同标签的视频
      // 2. 其次推荐同一上传者的视频
      // 3. 按热门度（播放量）排序
      // 4. 排除当前视频

      const recommendations = await ctx.prisma.video.findMany({
        where: {
          id: { not: videoId },
          status: "PUBLISHED",
          OR: [
            // 有相同标签的视频
            ...(tagIds.length > 0
              ? [{ tags: { some: { tagId: { in: tagIds } } } }]
              : []),
            // 同一上传者的视频
            { uploaderId: currentVideo.uploaderId },
          ],
        },
        orderBy: [
          { views: "desc" },
          { createdAt: "desc" },
        ],
        take: limit * 2, // 多取一些用于去重和排序
        include: {
          uploader: {
            select: { id: true, username: true, nickname: true, avatar: true },
          },
          tags: {
            include: { tag: { select: { id: true, name: true, slug: true } } },
          },
          _count: { select: { likes: true, favorites: true } },
        },
      });

      // 计算相关性分数并排序
      const scoredVideos = recommendations.map((video) => {
        let score = 0;

        // 标签匹配加分（每个匹配的标签 +10 分）
        const videoTagIds = video.tags.map((t) => t.tagId);
        const matchingTags = tagIds.filter((id) => videoTagIds.includes(id));
        score += matchingTags.length * 10;

        // 同一上传者加分 (+5 分)
        if (video.uploaderId === currentVideo.uploaderId) {
          score += 5;
        }

        // 热门度加分（播放量的对数）
        score += Math.log10(video.views + 1);

        return { ...video, _score: score };
      });

      // 按分数排序并取前 limit 个
      scoredVideos.sort((a, b) => b._score - a._score);
      
      // 移除 _score 字段并返回
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return scoredVideos.slice(0, limit).map(({ _score, ...video }) => video);
    }),
});
