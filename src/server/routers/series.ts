import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/db/schema";
import { protectedProcedure, publicProcedure } from "../orpc";
import { cursorCondition, requiredRow } from "../services/query";

export const seriesRouter = {
  // 获取用户的所有合集
  listByUser: publicProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = input.userId || context.session?.user?.id;
      if (!userId) {
        throw new ORPCError("UNAUTHORIZED", { message: "请先登录" });
      }

      const series = await context.db.query.series.findMany({
        with: {
          episodes: {
            with: { video: { columns: { coverUrl: true } } },
            orderBy: [asc(schema.seriesEpisode.episodeNum), desc(schema.seriesEpisode.id)],
            limit: 1,
          },
        },
        extras: (row) => ({
          _count: sql<{
            episodes: number;
          }>`json_build_object('episodes', (select count(*)::int from "SeriesEpisode" as "count_episodes" where "count_episodes"."seriesId" = ${sql`${row.id}`}))`.as(
            "_count",
          ),
        }),
        where: and(
          and(eq(schema.series.creatorId, userId)),
          cursorCondition(schema.series, (input.cursor ? { id: input.cursor } : undefined)?.id, [
            { column: schema.series.updatedAt, direction: "desc" },
          ]),
        ),
        orderBy: [desc(schema.series.updatedAt), desc(schema.series.id)],
        limit: input.limit + 1,
      });

      let nextCursor: string | undefined;
      if (series.length > input.limit) {
        const nextItem = series.pop();
        nextCursor = nextItem?.id;
      }

      return {
        items: series.map((s) => ({
          ...s,
          episodeCount: s._count.episodes,
          firstEpisodeCover: s.episodes[0]?.video.coverUrl || s.coverUrl,
        })),
        nextCursor,
      };
    }),

  // 获取单个合集详情（含所有剧集）
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const series = await context.db.query.series
        .findFirst({
          with: {
            creator: { columns: { id: true, username: true, nickname: true, avatar: true } },
            episodes: {
              with: {
                video: {
                  columns: {
                    id: true,
                    title: true,
                    coverUrl: true,
                    duration: true,
                    views: true,
                    status: true,
                  },
                },
              },
              orderBy: [asc(schema.seriesEpisode.episodeNum), desc(schema.seriesEpisode.id)],
            },
          },
          where: and(eq(schema.series.id, input.id)),
        })
        .then((row) => row ?? null);

      if (!series) {
        throw new ORPCError("NOT_FOUND", { message: "合集不存在" });
      }

      return series;
    }),

  // 根据视频ID获取其所属的合集
  getByVideoId: publicProcedure
    .input(z.object({ videoId: z.string() }))
    .handler(async ({ context, input }) => {
      const episode = await context.db.query.seriesEpisode
        .findFirst({
          with: {
            series: {
              with: {
                creator: { columns: { id: true, username: true, nickname: true, avatar: true } },
                episodes: {
                  with: {
                    video: {
                      columns: {
                        id: true,
                        title: true,
                        coverUrl: true,
                        duration: true,
                        views: true,
                        status: true,
                      },
                    },
                  },
                  orderBy: [asc(schema.seriesEpisode.episodeNum), desc(schema.seriesEpisode.id)],
                },
              },
            },
          },
          where: and(eq(schema.seriesEpisode.videoId, input.videoId)),
        })
        .then((row) => row ?? null);

      if (!episode) {
        return null;
      }

      return {
        series: episode.series,
        currentEpisode: episode.episodeNum,
      };
    }),

  // 创建合集
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(100),
        description: z.string().max(2000).optional(),
        coverUrl: z.string().url().optional().or(z.literal("")),
      }),
    )
    .handler(async ({ context, input }) => {
      const series = await context.db
        .insert(schema.series)
        .values({
          title: input.title,
          description: input.description || null,
          coverUrl: input.coverUrl || null,
          creatorId: context.session.user.id,
        })
        .returning()
        .then((rows) => requiredRow(rows));

      return series;
    }),

  // 更新合集
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(100).optional(),
        description: z.string().max(2000).optional(),
        coverUrl: z.string().url().optional().or(z.literal("")),
      }),
    )
    .handler(async ({ context, input }) => {
      const series = await context.db.query.series
        .findFirst({ where: and(eq(schema.series.id, input.id)) })
        .then((row) => row ?? null);

      if (!series) {
        throw new ORPCError("NOT_FOUND", { message: "合集不存在" });
      }

      if (series.creatorId !== context.session.user.id) {
        throw new ORPCError("FORBIDDEN", { message: "无权修改此合集" });
      }

      return context.db
        .update(schema.series)
        .set({
          title: input.title,
          description: input.description,
          coverUrl: input.coverUrl || null,
        })
        .where(and(eq(schema.series.id, input.id)))
        .returning()
        .then((rows) => requiredRow(rows));
    }),

  // 删除合集
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const series = await context.db.query.series
        .findFirst({ where: and(eq(schema.series.id, input.id)) })
        .then((row) => row ?? null);

      if (!series) {
        throw new ORPCError("NOT_FOUND", { message: "合集不存在" });
      }

      if (series.creatorId !== context.session.user.id) {
        throw new ORPCError("FORBIDDEN", { message: "无权删除此合集" });
      }

      await context.db
        .delete(schema.series)
        .where(and(eq(schema.series.id, input.id)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),

  // 添加视频到合集
  addVideo: protectedProcedure
    .input(
      z.object({
        seriesId: z.string(),
        videoId: z.string(),
        episodeNum: z.number().int().positive().optional(),
        episodeTitle: z.string().max(100).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const series = await context.db.query.series
        .findFirst({
          extras: (row) => ({
            _count: sql<{
              episodes: number;
            }>`json_build_object('episodes', (select count(*)::int from "SeriesEpisode" as "count_episodes" where "count_episodes"."seriesId" = ${sql`${row.id}`}))`.as(
              "_count",
            ),
          }),
          where: and(eq(schema.series.id, input.seriesId)),
        })
        .then((row) => row ?? null);

      if (!series) {
        throw new ORPCError("NOT_FOUND", { message: "合集不存在" });
      }

      if (series.creatorId !== context.session.user.id) {
        throw new ORPCError("FORBIDDEN", { message: "无权修改此合集" });
      }

      // 验证视频存在且属于用户
      const video = await context.db.query.video
        .findFirst({ where: and(eq(schema.video.id, input.videoId)) })
        .then((row) => row ?? null);

      if (!video) {
        throw new ORPCError("NOT_FOUND", { message: "视频不存在" });
      }

      if (video.uploaderId !== context.session.user.id) {
        throw new ORPCError("FORBIDDEN", { message: "只能添加自己的视频" });
      }

      // 检查是否已在合集中
      const existing = await context.db.query.seriesEpisode
        .findFirst({
          where: and(
            and(
              eq(schema.seriesEpisode.seriesId, input.seriesId),
              eq(schema.seriesEpisode.videoId, input.videoId),
            ),
          ),
        })
        .then((row) => row ?? null);

      if (existing) {
        throw new ORPCError("CONFLICT", { message: "视频已在合集中" });
      }

      // 自动分配集数
      const episodeNum = input.episodeNum || series._count.episodes + 1;

      // 检查集数是否已被占用
      const episodeExists = await context.db.query.seriesEpisode
        .findFirst({
          where: and(
            and(
              eq(schema.seriesEpisode.seriesId, input.seriesId),
              eq(schema.seriesEpisode.episodeNum, episodeNum),
            ),
          ),
        })
        .then((row) => row ?? null);

      if (episodeExists) {
        throw new ORPCError("CONFLICT", { message: `第 ${episodeNum} 集已存在` });
      }

      const episode = await (async () => {
        const inserted = requiredRow(
          await context.db
            .insert(schema.seriesEpisode)
            .values({
              seriesId: input.seriesId,
              videoId: input.videoId,
              episodeNum: episodeNum,
              episodeTitle: input.episodeTitle || null,
            })
            .returning(),
        );
        return requiredRow(
          await context.db.query.seriesEpisode.findFirst({
            ...{ with: { video: { columns: { id: true, title: true, coverUrl: true } } } },
            where: eq(schema.seriesEpisode.id, inserted.id),
          }),
        );
      })();

      // 更新合集的 updatedAt
      await context.db
        .update(schema.series)
        .set({ updatedAt: new Date() })
        .where(and(eq(schema.series.id, input.seriesId)))
        .returning()
        .then((rows) => requiredRow(rows));

      return episode;
    }),

  // 从合集移除视频
  removeVideo: protectedProcedure
    .input(
      z.object({
        seriesId: z.string(),
        videoId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const series = await context.db.query.series
        .findFirst({ where: and(eq(schema.series.id, input.seriesId)) })
        .then((row) => row ?? null);

      if (!series) {
        throw new ORPCError("NOT_FOUND", { message: "合集不存在" });
      }

      if (series.creatorId !== context.session.user.id) {
        throw new ORPCError("FORBIDDEN", { message: "无权修改此合集" });
      }

      await context.db
        .delete(schema.seriesEpisode)
        .where(
          and(
            and(
              eq(schema.seriesEpisode.seriesId, input.seriesId),
              eq(schema.seriesEpisode.videoId, input.videoId),
            ),
          ),
        )
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),

  // 更新剧集信息
  updateEpisode: protectedProcedure
    .input(
      z.object({
        seriesId: z.string(),
        videoId: z.string(),
        episodeNum: z.number().int().positive().optional(),
        episodeTitle: z.string().max(100).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const series = await context.db.query.series
        .findFirst({ where: and(eq(schema.series.id, input.seriesId)) })
        .then((row) => row ?? null);

      if (!series) {
        throw new ORPCError("NOT_FOUND", { message: "合集不存在" });
      }

      if (series.creatorId !== context.session.user.id) {
        throw new ORPCError("FORBIDDEN", { message: "无权修改此合集" });
      }

      // 如果要更新集数，检查是否冲突
      if (input.episodeNum) {
        const existing = await context.db.query.seriesEpisode
          .findFirst({
            where: and(
              eq(schema.seriesEpisode.seriesId, input.seriesId),
              eq(schema.seriesEpisode.episodeNum, input.episodeNum),
              ne(schema.seriesEpisode.videoId, input.videoId),
            ),
          })
          .then((row) => row ?? null);

        if (existing) {
          throw new ORPCError("CONFLICT", { message: `第 ${input.episodeNum} 集已存在` });
        }
      }

      return context.db
        .update(schema.seriesEpisode)
        .set({ episodeNum: input.episodeNum, episodeTitle: input.episodeTitle })
        .where(
          and(
            and(
              eq(schema.seriesEpisode.seriesId, input.seriesId),
              eq(schema.seriesEpisode.videoId, input.videoId),
            ),
          ),
        )
        .returning()
        .then((rows) => requiredRow(rows));
    }),

  // 重新排序剧集
  reorderEpisodes: protectedProcedure
    .input(
      z.object({
        seriesId: z.string(),
        episodes: z.array(
          z.object({
            videoId: z.string(),
            episodeNum: z.number().int().positive(),
          }),
        ),
      }),
    )
    .handler(async ({ context, input }) => {
      const series = await context.db.query.series
        .findFirst({ where: and(eq(schema.series.id, input.seriesId)) })
        .then((row) => row ?? null);

      if (!series) {
        throw new ORPCError("NOT_FOUND", { message: "合集不存在" });
      }

      if (series.creatorId !== context.session.user.id) {
        throw new ORPCError("FORBIDDEN", { message: "无权修改此合集" });
      }

      const videoIds = input.episodes.map((episode) => episode.videoId);
      const numbers = input.episodes.map((episode) => episode.episodeNum);
      if (new Set(videoIds).size !== videoIds.length || new Set(numbers).size !== numbers.length) {
        throw new ORPCError("BAD_REQUEST", { message: "剧集或集数不能重复" });
      }
      await context.db.transaction(async (tx) => {
        await tx
          .select({ id: schema.series.id })
          .from(schema.series)
          .where(eq(schema.series.id, input.seriesId))
          .for("update");
        const episodes = await tx
          .select()
          .from(schema.seriesEpisode)
          .where(eq(schema.seriesEpisode.seriesId, input.seriesId));
        if (videoIds.some((videoId) => !episodes.some((episode) => episode.videoId === videoId))) {
          throw new ORPCError("NOT_FOUND", { message: "剧集不存在" });
        }
        // 先暂存负集数，允许 1↔2 这样的交换通过唯一索引。
        for (const [index, episode] of input.episodes.entries()) {
          await tx
            .update(schema.seriesEpisode)
            .set({ episodeNum: -index - 1 })
            .where(
              and(
                eq(schema.seriesEpisode.seriesId, input.seriesId),
                eq(schema.seriesEpisode.videoId, episode.videoId),
              ),
            );
        }
        for (const episode of input.episodes) {
          await tx
            .update(schema.seriesEpisode)
            .set({ episodeNum: episode.episodeNum })
            .where(
              and(
                eq(schema.seriesEpisode.seriesId, input.seriesId),
                eq(schema.seriesEpisode.videoId, episode.videoId),
              ),
            );
        }
        await tx
          .update(schema.series)
          .set({ updatedAt: new Date() })
          .where(eq(schema.series.id, input.seriesId));
      });

      return { success: true };
    }),
};
