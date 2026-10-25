import { ORPCError } from "@orpc/server";
import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  max,
  ne,
  notExists,
  notInArray,
  or,
  sql,
  sum,
} from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/db/schema";
import { submitVideosToIndexNow, submitVideoToIndexNow } from "@/lib/indexnow";
import { deleteCachePattern, getCache, setCache } from "@/lib/redis";
import { protectedProcedure, publicProcedure, scopedAdminProcedure } from "../orpc";
import { cursorCondition, escapeLike, requiredRow } from "../services/query";

const VIDEO_CACHE_TTL = 60; // 1 minute
const STATS_CACHE_TTL = 15; // 15 seconds - 短缓存，仅防止并发请求
const SEARCH_SUGGESTIONS_CACHE_TTL = 300; // 5 minutes

export const videoRouter = {
  // 记录搜索
  recordSearch: publicProcedure
    .input(
      z.object({
        keyword: z.string().min(1).max(100),
        resultCount: z.number().default(0),
      }),
    )
    .handler(async ({ context, input }) => {
      // 标准化关键词
      const keyword = input.keyword.trim().toLowerCase();
      if (keyword.length < 2) return { success: true };

      await context.db
        .insert(schema.searchRecord)
        .values({
          keyword: keyword,
          userId: context.session?.user?.id,
          resultCount: input.resultCount,
        })
        .returning()
        .then((rows) => requiredRow(rows));

      // 清除热搜缓存
      await deleteCachePattern("search:hot*");

      return { success: true };
    }),

  // 热搜榜
  getHotSearches: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .handler(async ({ context, input }) => {
      const cacheKey = "search:hot";
      const cached = await getCache<{ keyword: string; score: number; isHot: boolean }[]>(cacheKey);
      if (cached) return cached;

      // 获取最近 7 天的搜索记录
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // 1. 基于实际搜索记录的热度（时间衰减）
      const searchRecords = await context.db
        .select({
          keyword: schema.searchRecord.keyword,
          searchCount: count(schema.searchRecord.id),
        })
        .from(schema.searchRecord)
        .where(gte(schema.searchRecord.createdAt, sevenDaysAgo))
        .groupBy(schema.searchRecord.keyword)
        .orderBy(desc(count(schema.searchRecord.id)))
        .limit(50);

      // 2. 基于热门视频的标签
      const hotVideos = await context.db.query.video.findMany({
        columns: { views: true },
        with: { tags: { with: { tag: { columns: { name: true } } }, limit: 3 } },
        where: and(eq(schema.video.status, "PUBLISHED"), gte(schema.video.createdAt, sevenDaysAgo)),
        orderBy: [desc(schema.video.views), desc(schema.video.id)],
        limit: 30,
      });

      // 3. 合并计算热度分数
      const scoreMap = new Map<string, { score: number; searchCount: number }>();

      // 搜索记录权重（主要来源）
      searchRecords.forEach((record) => {
        const keyword = record.keyword;
        const searchScore = record.searchCount * 10; // 每次搜索 10 分
        const existing = scoreMap.get(keyword) || { score: 0, searchCount: 0 };
        scoreMap.set(keyword, {
          score: existing.score + searchScore,
          searchCount: record.searchCount,
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
        const topTags = await context.db.query.tag.findMany({
          columns: { name: true },
          orderBy: [
            desc(
              sql`(select count(*) from "TagOnVideo" as "count_videos" where "count_videos"."tagId" = ${schema.tag.id})`,
            ),
            desc(schema.tag.id),
          ],
          limit: input.limit - hotSearches.length,
        });

        const existingKeywords = new Set(hotSearches.map((h) => h.keyword.toLowerCase()));
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
      }),
    )
    .handler(async ({ context, input }) => {
      const { query, limit } = input;
      const cacheKey = `search:suggestions:${query.toLowerCase()}`;

      // 尝试从缓存获取
      const cached = await getCache<{
        videos: { id: string; title: string }[];
        tags: { id: string; name: string; slug: string }[];
      }>(cacheKey);
      if (cached) return cached;

      // 并行搜索视频标题和标签
      const [videos, tags] = await Promise.all([
        context.db.query.video.findMany({
          columns: { id: true, title: true },
          where: and(
            eq(schema.video.status, "PUBLISHED"),
            ilike(schema.video.title, `%${escapeLike(query)}%`),
          ),
          orderBy: [desc(schema.video.views), desc(schema.video.id)],
          limit: limit,
        }),
        context.db.query.tag.findMany({
          columns: { id: true, name: true, slug: true },
          where: and(ilike(schema.tag.name, `%${escapeLike(query)}%`)),
          orderBy: [
            desc(
              sql`(select count(*) from "TagOnVideo" as "count_videos" where "count_videos"."tagId" = ${schema.tag.id})`,
            ),
            desc(schema.tag.id),
          ],
          limit: 5,
        }),
      ]);

      const result = { videos, tags };
      await setCache(cacheKey, result, SEARCH_SUGGESTIONS_CACHE_TTL);

      return result;
    }),

  // 获取网站公开统计数据
  getPublicStats: publicProcedure.handler(async ({ context }) => {
    const cacheKey = "stats:public";
    const cached = await getCache<{
      videoCount: number;
      userCount: number;
      tagCount: number;
      totalViews: number;
    }>(cacheKey);

    if (cached) return cached;

    const [videoCount, userCount, tagCount, viewsResult] = await Promise.all([
      context.db.$count(schema.video, and(eq(schema.video.status, "PUBLISHED"))),
      context.db.$count(schema.user, undefined),
      context.db.$count(schema.tag, undefined),
      context.db
        .select({ views: sum(schema.video.views).mapWith(Number) })
        .from(schema.video)
        .where(and(eq(schema.video.status, "PUBLISHED")))
        .then((rows) => ({ _sum: rows[0] })),
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
      }),
    )
    .handler(async ({ context, input }) => {
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

      const baseWhere = and(
        eq(schema.video.status, "PUBLISHED"),
        tagId
          ? exists(
              sql`(select 1 from "TagOnVideo" as "filter_tag" where "filter_tag"."videoId" = ${schema.video.id} and "filter_tag"."tagId" = ${tagId})`,
            )
          : undefined,
        search
          ? or(
              ilike(schema.video.title, `%${escapeLike(search)}%`),
              ilike(schema.video.description, `%${escapeLike(search)}%`),
            )
          : undefined,
        timeFilter ? gte(schema.video.createdAt, timeFilter) : undefined,
      );

      if (sortBy === "recommend") {
        const userId = context.session?.user?.id;
        let preferredTagIds: string[] = [];
        let excludeVideoIds: string[] = [];
        let searchKeywords: string[] = [];

        if (userId) {
          const [history, likes, favorites, searchRecords] = await Promise.all([
            context.db.query.watchHistory.findMany({
              columns: { videoId: true },
              where: and(eq(schema.watchHistory.userId, userId)),
              orderBy: [desc(schema.watchHistory.updatedAt), desc(schema.watchHistory.id)],
              limit: 100,
            }),
            context.db.query.like.findMany({
              columns: { videoId: true },
              where: and(eq(schema.like.userId, userId)),
              orderBy: [desc(schema.like.createdAt), desc(schema.like.id)],
              limit: 50,
            }),
            context.db.query.favorite.findMany({
              columns: { videoId: true },
              where: and(eq(schema.favorite.userId, userId)),
              orderBy: [desc(schema.favorite.createdAt), desc(schema.favorite.id)],
              limit: 50,
            }),
            // 获取用户最近的搜索历史
            context.db
              .select({
                keyword: schema.searchRecord.keyword,
                createdAt: max(schema.searchRecord.createdAt),
              })
              .from(schema.searchRecord)
              .where(eq(schema.searchRecord.userId, userId))
              .groupBy(schema.searchRecord.keyword)
              .orderBy(desc(max(schema.searchRecord.createdAt)))
              .limit(30),
          ]);

          // 提取搜索关键词（按时间衰减加权）
          const now = Date.now();
          const keywordWeights = new Map<string, number>();
          searchRecords.forEach((record) => {
            const daysSince = (now - (record.createdAt?.getTime() ?? now)) / (1000 * 60 * 60 * 24);
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
            ]),
          );

          if (interactionVideoIds.length > 0) {
            const interactionTags = await context.db.query.tagOnVideo.findMany({
              columns: { tagId: true },
              where: and(inArray(schema.tagOnVideo.videoId, interactionVideoIds)),
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
            const matchingTags = await context.db.query.tag.findMany({
              columns: { id: true },
              where: and(
                or(
                  ...searchKeywords.map((keyword) =>
                    and(ilike(schema.tag.name, `%${escapeLike(keyword)}%`)),
                  ),
                ),
              ),
              limit: 10,
            });

            // 合并搜索关键词匹配的标签（权重较高）
            matchingTags.forEach((tag) => {
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
        const recommendWhere = and(
          baseWhere,
          excludeVideoIds.length ? notInArray(schema.video.id, excludeVideoIds) : undefined,
          !tagId && preferredTagIds.length
            ? exists(
                sql`(select 1 from "TagOnVideo" as "preferred_tag" where "preferred_tag"."videoId" = ${schema.video.id} and ${inArray(sql`"preferred_tag"."tagId"`, preferredTagIds)})`,
              )
            : undefined,
        );

        const videos = await context.db.query.video.findMany({
          with: {
            uploader: { columns: { id: true, username: true, nickname: true, avatar: true } },
            tags: { columns: { tagId: true } },
          },
          extras: (row) => ({
            _count: sql<{
              likes: number;
              favorites: number;
            }>`json_build_object('likes', (select count(*)::int from "Like" as "count_likes" where "count_likes"."videoId" = ${sql`${row.id}`}), 'favorites', (select count(*)::int from "Favorite" as "count_favorites" where "count_favorites"."videoId" = ${sql`${row.id}`}))`.as(
              "_count",
            ),
          }),
          where: and(
            recommendWhere,
            cursorCondition(schema.video, (cursor ? { id: cursor } : undefined)?.id, [
              { column: schema.video.createdAt, direction: "desc" },
              { column: schema.video.id, direction: "desc" },
            ]),
          ),
          orderBy: [desc(schema.video.createdAt), desc(schema.video.id)],
          limit: takeSize + 1,
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
          const days = (Date.now() - video.createdAt.getTime()) / (1000 * 60 * 60 * 24);
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

          const baseScore = (video.views + likesCount * 5 + favoritesCount * 10) * decay;

          const randomFactor = 0.9 + (hashString(`${video.id}-${hourSeed}`) % 21) / 100;

          return { video, score: (baseScore + tagBonus + searchBonus) * randomFactor };
        });

        const ranked = scored
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((item) => item.video);

        // 获取总数量（仅首页请求时计算）
        let totalCount: number | undefined;
        if (!cursor) {
          totalCount = await context.db.$count(schema.video, baseWhere);
        }

        return { videos: ranked, nextCursor, totalCount };
      }

      const sortColumn = sortBy === "views" ? schema.video.views : schema.video.createdAt;
      const orderBy = [desc(sortColumn), desc(schema.video.id)];

      // 并行获取视频和总数量（仅首页请求时计算总数）
      const [videos, totalCount] = await Promise.all([
        context.db.query.video.findMany({
          with: {
            uploader: { columns: { id: true, username: true, nickname: true, avatar: true } },
          },
          extras: (row) => ({
            _count: sql<{
              likes: number;
              favorites: number;
            }>`json_build_object('likes', (select count(*)::int from "Like" as "count_likes" where "count_likes"."videoId" = ${sql`${row.id}`}), 'favorites', (select count(*)::int from "Favorite" as "count_favorites" where "count_favorites"."videoId" = ${sql`${row.id}`}))`.as(
              "_count",
            ),
          }),
          where: and(
            baseWhere,
            cursorCondition(schema.video, (cursor ? { id: cursor } : undefined)?.id, [
              { column: sortColumn, direction: "desc" },
            ]),
          ),
          orderBy,
          limit: limit + 1,
        }),
        cursor ? Promise.resolve(undefined) : context.db.$count(schema.video, baseWhere),
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
    .handler(async ({ context, input }) => {
      const cacheKey = `video:${input.id}`;
      const cached = await getCache<typeof video>(cacheKey);
      if (cached) {
        const visible = await context.db.query.video.findFirst({
          columns: { id: true },
          where: and(eq(schema.video.id, input.id), eq(schema.video.status, "PUBLISHED")),
        });
        if (!visible) throw new ORPCError("NOT_FOUND", { message: "视频不存在" });
        return cached;
      }

      const video = await context.db.query.video
        .findFirst({
          with: {
            uploader: { columns: { id: true, username: true, nickname: true, avatar: true } },
            tags: { with: { tag: { columns: { id: true, name: true, slug: true } } } },
          },
          extras: (row) => ({
            _count: sql<{
              likes: number;
              dislikes: number;
              confused: number;
              favorites: number;
            }>`json_build_object('likes', (select count(*)::int from "Like" as "count_likes" where "count_likes"."videoId" = ${sql`${row.id}`}), 'dislikes', (select count(*)::int from "Dislike" as "count_dislikes" where "count_dislikes"."videoId" = ${sql`${row.id}`}), 'confused', (select count(*)::int from "Confused" as "count_confused" where "count_confused"."videoId" = ${sql`${row.id}`}), 'favorites', (select count(*)::int from "Favorite" as "count_favorites" where "count_favorites"."videoId" = ${sql`${row.id}`}))`.as(
              "_count",
            ),
          }),
          where: and(eq(schema.video.id, input.id), eq(schema.video.status, "PUBLISHED")),
        })
        .then((row) => row ?? null);

      if (!video) {
        throw new ORPCError("NOT_FOUND", { message: "视频不存在" });
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
      }),
    )
    .handler(async ({ context, input }) => {
      const videos = await context.db.query.video.findMany({
        with: { tags: { with: { tag: { columns: { id: true, name: true, slug: true } } } } },
        extras: (row) => ({
          _count: sql<{
            likes: number;
            favorites: number;
            comments: number;
          }>`json_build_object('likes', (select count(*)::int from "Like" as "count_likes" where "count_likes"."videoId" = ${sql`${row.id}`}), 'favorites', (select count(*)::int from "Favorite" as "count_favorites" where "count_favorites"."videoId" = ${sql`${row.id}`}), 'comments', (select count(*)::int from "Comment" as "count_comments" where "count_comments"."videoId" = ${sql`${row.id}`}))`.as(
            "_count",
          ),
        }),
        where: and(
          and(
            eq(schema.video.uploaderId, context.session.user.id),
            input.status !== "ALL"
              ? and(eq(schema.video.status, input.status as "PUBLISHED" | "PENDING" | "REJECTED"))
              : undefined,
          ),
          cursorCondition(schema.video, (input.cursor ? { id: input.cursor } : undefined)?.id, [
            { column: schema.video.createdAt, direction: "desc" },
          ]),
        ),
        orderBy: [desc(schema.video.createdAt), desc(schema.video.id)],
        limit: input.limit + 1,
      });

      let nextCursor: string | undefined;
      if (videos.length > input.limit) {
        const nextItem = videos.pop();
        nextCursor = nextItem?.id;
      }

      return { videos, nextCursor };
    }),

  // 获取单个视频用于编辑（无需 PUBLISHED 状态限制）
  getForEdit: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const video = await context.db.query.video
        .findFirst({
          with: { tags: { with: { tag: { columns: { id: true, name: true, slug: true } } } } },
          where: and(eq(schema.video.id, input.id)),
        })
        .then((row) => row ?? null);

      if (!video) {
        throw new ORPCError("NOT_FOUND", { message: "视频不存在" });
      }

      if (video.uploaderId !== context.session.user.id) {
        throw new ORPCError("FORBIDDEN", { message: "无权编辑此视频" });
      }

      return video;
    }),

  // 增加播放量
  incrementViews: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await context.db
        .update(schema.video)
        .set({ views: sql`${schema.video.views} + ${1}` })
        .where(and(eq(schema.video.id, input.id)))
        .returning()
        .then((rows) => requiredRow(rows));
      await deleteCachePattern(`video:${input.id}`);
      return { success: true };
    }),

  // 批量提交 IndexNow（用于批量导入完成后）
  submitBatchToIndexNow: protectedProcedure
    .input(z.object({ videoIds: z.array(z.string()) }))
    .handler(async ({ input }) => {
      const result = await submitVideosToIndexNow(input.videoIds);
      return result;
    }),

  // 创建视频
  create: protectedProcedure
    .input(
      z.object({
        customId: z
          .string()
          .regex(/^av\d+$/i, "自定义ID格式必须为 av+数字")
          .optional(), // B站AV号作为ID
        title: z.string().min(1).max(100),
        description: z.string().max(5000).optional(),
        coverUrl: z.string().url().optional().or(z.literal("")),
        videoUrl: z.string().url(),
        subtitleUrl: z.string().url().optional().or(z.literal("")),
        danmakuUrl: z.string().url().optional().or(z.literal("")),
        duration: z.number().optional(),
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(), // 新建标签名称
        pages: z
          .array(
            z.object({
              page: z.number(),
              title: z.string(),
              cid: z.number().optional(),
            }),
          )
          .optional(), // B站分P信息
        skipIndexNow: z.boolean().optional(), // 批量导入时跳过 IndexNow
      }),
    )
    .handler(async ({ context, input }) => {
      const {
        customId,
        tagIds,
        tagNames,
        coverUrl,
        subtitleUrl,
        danmakuUrl,
        pages,
        skipIndexNow,
        ...data
      } = input;

      // 如果提供了自定义ID，检查是否已存在
      if (customId) {
        const existing = await context.db.query.video
          .findFirst({ where: and(eq(schema.video.id, customId.toLowerCase())) })
          .then((row) => row ?? null);
        if (existing) {
          throw new ORPCError("CONFLICT", { message: `视频 ${customId.toLowerCase()} 已存在` });
        }
      }

      // 处理新标签（使用 upsert 避免并发冲突）
      const allTagIds: string[] = [...(tagIds || [])];
      if (tagNames && tagNames.length > 0) {
        for (const tagName of tagNames) {
          const slug =
            tagName
              .toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "") || `tag-${Date.now()}`;

          try {
            // 使用 upsert 避免并发创建冲突
            const tag = await context.db
              .insert(schema.tag)
              .values({ name: tagName, slug: slug })
              .onConflictDoUpdate({ target: [schema.tag.name], set: { name: schema.tag.name } })
              .returning()
              .then((rows) => requiredRow(rows));
            if (!allTagIds.includes(tag.id)) {
              allTagIds.push(tag.id);
            }
          } catch {
            // 如果 upsert 失败（slug 冲突），尝试查找已存在的标签
            const existingTag = await context.db.query.tag
              .findFirst({
                where: and(or(and(eq(schema.tag.name, tagName)), and(eq(schema.tag.slug, slug)))),
              })
              .then((row) => row ?? null);
            if (existingTag && !allTagIds.includes(existingTag.id)) {
              allTagIds.push(existingTag.id);
            }
          }
        }
      }

      // 去重标签ID
      const uniqueTagIds = [...new Set(allTagIds)];

      const video = await context.db.transaction(async (tx) => {
        const created = requiredRow(
          await tx
            .insert(schema.video)
            .values({
              ...(customId ? { id: customId.toLowerCase() } : {}),
              title: data.title,
              description: data.description,
              videoUrl: data.videoUrl,
              duration: data.duration,
              status: "PUBLISHED",
              coverUrl: coverUrl || null,
              subtitleUrl: subtitleUrl || null,
              danmakuUrl: danmakuUrl || null,
              pages: pages && pages.length > 1 ? pages : undefined,
              uploaderId: context.session.user.id,
            })
            .returning(),
        );
        if (uniqueTagIds.length)
          await tx
            .insert(schema.tagOnVideo)
            .values(uniqueTagIds.map((tagId) => ({ videoId: created.id, tagId })));
        return created;
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
      }),
    )
    .handler(async ({ context, input }) => {
      const { id, tagIds, tagNames, ...data } = input;

      const video = await context.db.query.video
        .findFirst({ columns: { uploaderId: true }, where: and(eq(schema.video.id, id)) })
        .then((row) => row ?? null);

      if (!video) {
        throw new ORPCError("NOT_FOUND");
      }

      if (video.uploaderId !== context.session.user.id) {
        throw new ORPCError("FORBIDDEN");
      }

      // 更新视频基本信息
      const updated = await context.db
        .update(schema.video)
        .set(data)
        .where(and(eq(schema.video.id, id)))
        .returning()
        .then((rows) => requiredRow(rows));

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

            const existingTag = await context.db.query.tag
              .findFirst({
                where: and(or(and(eq(schema.tag.name, tagName)), and(eq(schema.tag.slug, slug)))),
              })
              .then((row) => row ?? null);

            if (existingTag) {
              if (!allTagIds.includes(existingTag.id)) {
                allTagIds.push(existingTag.id);
              }
            } else {
              const newTag = await context.db
                .insert(schema.tag)
                .values({ name: tagName, slug: slug || `tag-${Date.now()}` })
                .returning()
                .then((rows) => requiredRow(rows));
              allTagIds.push(newTag.id);
            }
          }
        }

        // 删除所有现有标签关联
        await context.db
          .delete(schema.tagOnVideo)
          .where(and(eq(schema.tagOnVideo.videoId, id)))
          .returning()
          .then((rows) => ({ count: rows.length }));

        // 创建新的标签关联
        if (allTagIds.length > 0) {
          await context.db
            .insert(schema.tagOnVideo)
            .values(
              allTagIds.map((tagId) => ({
                videoId: id,
                tagId,
              })),
            )
            .returning()
            .then((rows) => ({ count: rows.length }));
        }

        // 清理空标签
        await context.db
          .delete(schema.tag)
          .where(
            and(
              notExists(
                sql`(select 1 from "TagOnVideo" as "rel_4" where ${and(eq(sql`"rel_4"."tagId"`, schema.tag.id), undefined)})`,
              ),
            ),
          )
          .returning()
          .then((rows) => ({ count: rows.length }));
      }

      await deleteCachePattern(`video:${id}`);

      // 视频更新后通知搜索引擎重新索引
      submitVideoToIndexNow(id).catch(() => {});

      return updated;
    }),

  // 删除视频（真删除）
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const video = await context.db.query.video
        .findFirst({
          columns: { uploaderId: true },
          with: { tags: { columns: { tagId: true } } },
          where: and(eq(schema.video.id, input.id)),
        })
        .then((row) => row ?? null);

      if (!video) {
        throw new ORPCError("NOT_FOUND");
      }

      if (video.uploaderId !== context.session.user.id) {
        throw new ORPCError("FORBIDDEN");
      }

      const tagIds = video.tags.map((t) => t.tagId);

      // 真删除视频（关联记录会通过 CASCADE 自动删除）
      await context.db
        .delete(schema.video)
        .where(and(eq(schema.video.id, input.id)))
        .returning()
        .then((rows) => requiredRow(rows));

      // 清理空标签（没有关联任何视频的标签）
      if (tagIds.length > 0) {
        await context.db
          .delete(schema.tag)
          .where(
            and(
              inArray(schema.tag.id, tagIds),
              notExists(
                sql`(select 1 from "TagOnVideo" as "rel_5" where ${and(eq(sql`"rel_5"."tagId"`, schema.tag.id), undefined)})`,
              ),
            ),
          )
          .returning()
          .then((rows) => ({ count: rows.length }));
      }

      await deleteCachePattern(`video:${input.id}`);
      return { success: true };
    }),

  // 批量删除视频
  batchDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .handler(async ({ context, input }) => {
      // 验证所有视频属于当前用户
      const videos = await context.db.query.video.findMany({
        columns: { id: true },
        with: { tags: { columns: { tagId: true } } },
        where: and(
          inArray(schema.video.id, input.ids),
          eq(schema.video.uploaderId, context.session.user.id),
        ),
      });

      if (videos.length === 0) {
        throw new ORPCError("NOT_FOUND", { message: "没有找到可删除的视频" });
      }

      const videoIds = videos.map((v) => v.id);
      const tagIds = [...new Set(videos.flatMap((v) => v.tags.map((t) => t.tagId)))];

      // 批量删除
      await context.db
        .delete(schema.video)
        .where(and(inArray(schema.video.id, videoIds)))
        .returning()
        .then((rows) => ({ count: rows.length }));

      // 清理空标签
      if (tagIds.length > 0) {
        await context.db
          .delete(schema.tag)
          .where(
            and(
              inArray(schema.tag.id, tagIds),
              notExists(
                sql`(select 1 from "TagOnVideo" as "rel_6" where ${and(eq(sql`"rel_6"."tagId"`, schema.tag.id), undefined)})`,
              ),
            ),
          )
          .returning()
          .then((rows) => ({ count: rows.length }));
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
    .handler(async ({ context, input }) => {
      return context.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${context.session.user.id}:${input.videoId}`}))`,
        );
        const existing = await tx.query.like
          .findFirst({
            where: and(
              and(
                eq(schema.like.userId, context.session.user.id),
                eq(schema.like.videoId, input.videoId),
              ),
            ),
          })
          .then((row) => row ?? null);

        if (existing) {
          await tx
            .delete(schema.like)
            .where(and(eq(schema.like.id, existing.id)))
            .returning()
            .then((rows) => requiredRow(rows));
          return { liked: false };
        }

        // 点赞时移除踩和疑惑
        await Promise.all([
          tx
            .delete(schema.dislike)
            .where(
              and(
                eq(schema.dislike.userId, context.session.user.id),
                eq(schema.dislike.videoId, input.videoId),
              ),
            )
            .returning()
            .then((rows) => ({ count: rows.length })),
          tx
            .delete(schema.confused)
            .where(
              and(
                eq(schema.confused.userId, context.session.user.id),
                eq(schema.confused.videoId, input.videoId),
              ),
            )
            .returning()
            .then((rows) => ({ count: rows.length })),
        ]);

        await tx
          .insert(schema.like)
          .values({ userId: context.session.user.id, videoId: input.videoId })
          .returning()
          .then((rows) => requiredRow(rows));

        return { liked: true };
      });
    }),

  // 踩
  dislike: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .handler(async ({ context, input }) => {
      return context.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${context.session.user.id}:${input.videoId}`}))`,
        );
        const existing = await tx.query.dislike
          .findFirst({
            where: and(
              and(
                eq(schema.dislike.userId, context.session.user.id),
                eq(schema.dislike.videoId, input.videoId),
              ),
            ),
          })
          .then((row) => row ?? null);

        if (existing) {
          await tx
            .delete(schema.dislike)
            .where(and(eq(schema.dislike.id, existing.id)))
            .returning()
            .then((rows) => requiredRow(rows));
          return { disliked: false };
        }

        // 踩时移除赞和疑惑
        await Promise.all([
          tx
            .delete(schema.like)
            .where(
              and(
                eq(schema.like.userId, context.session.user.id),
                eq(schema.like.videoId, input.videoId),
              ),
            )
            .returning()
            .then((rows) => ({ count: rows.length })),
          tx
            .delete(schema.confused)
            .where(
              and(
                eq(schema.confused.userId, context.session.user.id),
                eq(schema.confused.videoId, input.videoId),
              ),
            )
            .returning()
            .then((rows) => ({ count: rows.length })),
        ]);

        await tx
          .insert(schema.dislike)
          .values({ userId: context.session.user.id, videoId: input.videoId })
          .returning()
          .then((rows) => requiredRow(rows));

        return { disliked: true };
      });
    }),

  // 疑惑
  confused: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .handler(async ({ context, input }) => {
      return context.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${context.session.user.id}:${input.videoId}`}))`,
        );
        const existing = await tx.query.confused
          .findFirst({
            where: and(
              and(
                eq(schema.confused.userId, context.session.user.id),
                eq(schema.confused.videoId, input.videoId),
              ),
            ),
          })
          .then((row) => row ?? null);

        if (existing) {
          await tx
            .delete(schema.confused)
            .where(and(eq(schema.confused.id, existing.id)))
            .returning()
            .then((rows) => requiredRow(rows));
          return { confused: false };
        }

        // 疑惑时移除赞和踩
        await Promise.all([
          tx
            .delete(schema.like)
            .where(
              and(
                eq(schema.like.userId, context.session.user.id),
                eq(schema.like.videoId, input.videoId),
              ),
            )
            .returning()
            .then((rows) => ({ count: rows.length })),
          tx
            .delete(schema.dislike)
            .where(
              and(
                eq(schema.dislike.userId, context.session.user.id),
                eq(schema.dislike.videoId, input.videoId),
              ),
            )
            .returning()
            .then((rows) => ({ count: rows.length })),
        ]);

        await tx
          .insert(schema.confused)
          .values({ userId: context.session.user.id, videoId: input.videoId })
          .returning()
          .then((rows) => requiredRow(rows));

        return { confused: true };
      });
    }),

  // 收藏
  favorite: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .handler(async ({ context, input }) => {
      return context.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`${context.session.user.id}:${input.videoId}`}))`,
        );
        const existing = await tx.query.favorite
          .findFirst({
            where: and(
              and(
                eq(schema.favorite.userId, context.session.user.id),
                eq(schema.favorite.videoId, input.videoId),
              ),
            ),
          })
          .then((row) => row ?? null);

        if (existing) {
          await tx
            .delete(schema.favorite)
            .where(and(eq(schema.favorite.id, existing.id)))
            .returning()
            .then((rows) => requiredRow(rows));
          return { favorited: false };
        }

        await tx
          .insert(schema.favorite)
          .values({ userId: context.session.user.id, videoId: input.videoId })
          .returning()
          .then((rows) => requiredRow(rows));

        return { favorited: true };
      });
    }),

  // 检查点赞/踩/疑惑/收藏状态
  getInteractionStatus: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .handler(async ({ context, input }) => {
      const [like, dislike, confused, favorite] = await Promise.all([
        context.db.query.like
          .findFirst({
            where: and(
              and(
                eq(schema.like.userId, context.session.user.id),
                eq(schema.like.videoId, input.videoId),
              ),
            ),
          })
          .then((row) => row ?? null),
        context.db.query.dislike
          .findFirst({
            where: and(
              and(
                eq(schema.dislike.userId, context.session.user.id),
                eq(schema.dislike.videoId, input.videoId),
              ),
            ),
          })
          .then((row) => row ?? null),
        context.db.query.confused
          .findFirst({
            where: and(
              and(
                eq(schema.confused.userId, context.session.user.id),
                eq(schema.confused.videoId, input.videoId),
              ),
            ),
          })
          .then((row) => row ?? null),
        context.db.query.favorite
          .findFirst({
            where: and(
              and(
                eq(schema.favorite.userId, context.session.user.id),
                eq(schema.favorite.videoId, input.videoId),
              ),
            ),
          })
          .then((row) => row ?? null),
      ]);

      return {
        liked: !!like,
        disliked: !!dislike,
        confused: !!confused,
        favorited: !!favorite,
      };
    }),

  // 管理员：审核视频
  moderate: scopedAdminProcedure("video:moderate")
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      }),
    )
    .handler(async ({ context, input }) => {
      const video = await context.db
        .update(schema.video)
        .set({ status: input.status })
        .where(and(eq(schema.video.id, input.id)))
        .returning()
        .then((rows) => requiredRow(rows));

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
      }),
    )
    .handler(async ({ context, input }) => {
      const favorites = await context.db.query.favorite.findMany({
        with: {
          video: {
            with: {
              uploader: { columns: { id: true, username: true, nickname: true, avatar: true } },
            },
            extras: (row) => ({
              _count: sql<{
                likes: number;
                favorites: number;
              }>`json_build_object('likes', (select count(*)::int from "Like" as "count_likes" where "count_likes"."videoId" = ${sql`${row.id}`}), 'favorites', (select count(*)::int from "Favorite" as "count_favorites" where "count_favorites"."videoId" = ${sql`${row.id}`}))`.as(
                "_count",
              ),
            }),
          },
        },
        where: and(
          and(eq(schema.favorite.userId, context.session.user.id)),
          cursorCondition(schema.favorite, (input.cursor ? { id: input.cursor } : undefined)?.id, [
            { column: schema.favorite.createdAt, direction: "desc" },
          ]),
        ),
        orderBy: [desc(schema.favorite.createdAt), desc(schema.favorite.id)],
        limit: input.limit + 1,
      });

      let nextCursor: string | undefined;
      if (favorites.length > input.limit) {
        const nextItem = favorites.pop();
        nextCursor = nextItem?.id;
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
      }),
    )
    .handler(async ({ context, input }) => {
      const history = await context.db.query.watchHistory.findMany({
        with: {
          video: {
            with: {
              uploader: { columns: { id: true, username: true, nickname: true, avatar: true } },
            },
            extras: (row) => ({
              _count: sql<{
                likes: number;
                favorites: number;
              }>`json_build_object('likes', (select count(*)::int from "Like" as "count_likes" where "count_likes"."videoId" = ${sql`${row.id}`}), 'favorites', (select count(*)::int from "Favorite" as "count_favorites" where "count_favorites"."videoId" = ${sql`${row.id}`}))`.as(
                "_count",
              ),
            }),
          },
        },
        where: and(
          and(
            eq(schema.watchHistory.userId, context.session.user.id),
            exists(
              sql`(select 1 from "Video" as "rel_8" where ${and(eq(sql`"rel_8"."id"`, schema.watchHistory.videoId), and(eq(sql`"rel_8"."status"`, "PUBLISHED")))})`,
            ),
          ),
          cursorCondition(
            schema.watchHistory,
            (input.cursor ? { id: input.cursor } : undefined)?.id,
            [{ column: schema.watchHistory.updatedAt, direction: "desc" }],
          ),
        ),
        orderBy: [desc(schema.watchHistory.updatedAt), desc(schema.watchHistory.id)],
        limit: input.limit + 1,
      });

      let nextCursor: string | undefined;
      if (history.length > input.limit) {
        const nextItem = history.pop();
        nextCursor = nextItem?.id;
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
      }),
    )
    .handler(async ({ context, input }) => {
      await context.db
        .insert(schema.watchHistory)
        .values({
          userId: context.session.user.id,
          videoId: input.videoId,
          progress: input.progress,
        })
        .onConflictDoUpdate({
          target: [schema.watchHistory.userId, schema.watchHistory.videoId],
          set: { progress: input.progress },
        })
        .returning()
        .then((rows) => requiredRow(rows));
      return { success: true };
    }),

  // 清空观看历史
  clearHistory: protectedProcedure.handler(async ({ context }) => {
    await context.db
      .delete(schema.watchHistory)
      .where(and(eq(schema.watchHistory.userId, context.session.user.id)))
      .returning()
      .then((rows) => ({ count: rows.length }));
    return { success: true };
  }),

  // 删除单条历史记录
  removeHistoryItem: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .handler(async ({ context, input }) => {
      await context.db
        .delete(schema.watchHistory)
        .where(
          and(
            eq(schema.watchHistory.userId, context.session.user.id),
            eq(schema.watchHistory.videoId, input.videoId),
          ),
        )
        .returning()
        .then((rows) => ({ count: rows.length }));
      return { success: true };
    }),

  // 取消收藏
  unfavorite: protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .handler(async ({ context, input }) => {
      await context.db
        .delete(schema.favorite)
        .where(
          and(
            eq(schema.favorite.userId, context.session.user.id),
            eq(schema.favorite.videoId, input.videoId),
          ),
        )
        .returning()
        .then((rows) => ({ count: rows.length }));
      return { success: true };
    }),

  // 批量取消收藏
  batchUnfavorite: protectedProcedure
    .input(z.object({ videoIds: z.array(z.string()) }))
    .handler(async ({ context, input }) => {
      await context.db
        .delete(schema.favorite)
        .where(
          and(
            eq(schema.favorite.userId, context.session.user.id),
            inArray(schema.favorite.videoId, input.videoIds),
          ),
        )
        .returning()
        .then((rows) => ({ count: rows.length }));
      return { success: true, count: input.videoIds.length };
    }),

  // 批量删除历史记录
  batchRemoveHistory: protectedProcedure
    .input(z.object({ videoIds: z.array(z.string()) }))
    .handler(async ({ context, input }) => {
      await context.db
        .delete(schema.watchHistory)
        .where(
          and(
            eq(schema.watchHistory.userId, context.session.user.id),
            inArray(schema.watchHistory.videoId, input.videoIds),
          ),
        )
        .returning()
        .then((rows) => ({ count: rows.length }));
      return { success: true, count: input.videoIds.length };
    }),

  // 获取推荐视频
  getRecommendations: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .handler(async ({ context, input }) => {
      const { videoId, limit } = input;

      // 获取当前视频信息（包括标签和上传者）
      const currentVideo = await context.db.query.video
        .findFirst({
          with: { tags: { columns: { tagId: true } } },
          where: and(eq(schema.video.id, videoId)),
        })
        .then((row) => row ?? null);

      if (!currentVideo) {
        return [];
      }

      const tagIds = currentVideo.tags.map((t) => t.tagId);

      // 推荐算法：
      // 1. 优先推荐具有相同标签的视频
      // 2. 其次推荐同一上传者的视频
      // 3. 按热门度（播放量）排序
      // 4. 排除当前视频

      const recommendations = await context.db.query.video.findMany({
        with: {
          uploader: { columns: { id: true, username: true, nickname: true, avatar: true } },
          tags: { with: { tag: { columns: { id: true, name: true, slug: true } } } },
        },
        extras: (row) => ({
          _count: sql<{
            likes: number;
            favorites: number;
          }>`json_build_object('likes', (select count(*)::int from "Like" as "count_likes" where "count_likes"."videoId" = ${sql`${row.id}`}), 'favorites', (select count(*)::int from "Favorite" as "count_favorites" where "count_favorites"."videoId" = ${sql`${row.id}`}))`.as(
            "_count",
          ),
        }),
        where: and(
          ne(schema.video.id, videoId),
          eq(schema.video.status, "PUBLISHED"),
          or(
            ...(tagIds.length > 0
              ? [
                  and(
                    exists(
                      sql`(select 1 from "TagOnVideo" as "rel_10" where ${and(eq(sql`"rel_10"."videoId"`, schema.video.id), and(inArray(sql`"rel_10"."tagId"`, tagIds)))})`,
                    ),
                  ),
                ]
              : []),
            and(eq(schema.video.uploaderId, currentVideo.uploaderId)),
          ),
        ),
        orderBy: [desc(schema.video.views), desc(schema.video.createdAt), desc(schema.video.id)],
        limit: limit * 2,
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
      return scoredVideos.slice(0, limit).map(({ _score, ...video }) => video);
    }),
};
