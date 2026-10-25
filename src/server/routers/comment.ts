import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, exists, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/db/schema";
import { type DeviceInfo, parseDeviceInfo } from "@/lib/device-info";
import { getIpLocation } from "@/lib/ip-location";
import { protectedProcedure, publicProcedure } from "../orpc";
import { hasAdminScope } from "../services/permissions";
import { cursorCondition, requiredRow } from "../services/query";

// 排序类型
const SortType = z.enum(["newest", "oldest", "popular"]);

export const commentRouter = {
  // 获取全站最新评论流
  listRecent: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .handler(async ({ context, input }) => {
      const { cursor, limit } = input;

      const comments = await context.db.query.comment.findMany({
        with: {
          user: { columns: { id: true, username: true, nickname: true, avatar: true } },
          video: { columns: { id: true, title: true, coverUrl: true } },
        },
        where: and(
          and(
            eq(schema.comment.isDeleted, false),
            eq(schema.comment.isHidden, false),
            exists(
              sql`(select 1 from "Video" as "rel_3" where ${and(eq(sql`"rel_3"."id"`, schema.comment.videoId), and(eq(sql`"rel_3"."status"`, "PUBLISHED")))})`,
            ),
          ),
          cursorCondition(schema.comment, (cursor ? { id: cursor } : undefined)?.id, [
            { column: schema.comment.createdAt, direction: "desc" },
          ]),
        ),
        orderBy: [desc(schema.comment.createdAt), desc(schema.comment.id)],
        limit: limit + 1,
      });

      let nextCursor: string | undefined;
      if (comments.length > limit) {
        const nextItem = comments.pop();
        nextCursor = nextItem?.id;
      }

      return {
        comments,
        nextCursor,
      };
    }),

  // 获取视频评论列表
  list: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
        sort: SortType.default("newest"),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .handler(async ({ context, input }) => {
      const { videoId, sort, cursor, limit } = input;

      // 构建排序条件
      const sortColumn = sort === "popular" ? schema.comment.likes : schema.comment.createdAt;
      const direction = sort === "oldest" ? "asc" : "desc";
      const orderBy = [
        direction === "asc" ? asc(sortColumn) : desc(sortColumn),
        desc(schema.comment.id),
      ];

      // 查询顶级评论（parentId 为 null）
      const comments = await context.db.query.comment.findMany({
        with: {
          user: { columns: { id: true, username: true, nickname: true, avatar: true } },
          replyToUser: { columns: { id: true, username: true, nickname: true } },
          reactions: context.session?.user
            ? {
                columns: { isLike: true },
                where: and(eq(schema.commentReaction.userId, context.session.user.id)),
              }
            : undefined,
        },
        extras: (row) => ({
          _count: sql<{
            replies: number;
          }>`json_build_object('replies', (select count(*)::int from "Comment" as "count_replies" where "count_replies"."parentId" = ${sql`${row.id}`}))`.as(
            "_count",
          ),
        }),
        where: and(
          and(
            eq(schema.comment.videoId, videoId),
            isNull(schema.comment.parentId),
            eq(schema.comment.isDeleted, false),
            eq(schema.comment.isHidden, false),
          ),
          cursorCondition(schema.comment, (cursor ? { id: cursor } : undefined)?.id, [
            { column: sortColumn, direction: direction },
          ]),
        ),
        orderBy,
        limit: limit + 1,
      });

      let nextCursor: string | undefined;
      if (comments.length > limit) {
        const nextItem = comments.pop();
        nextCursor = nextItem?.id;
      }

      // 处理用户反应状态
      const commentsWithReaction = comments.map((comment) => ({
        ...comment,
        userReaction: comment.reactions?.[0]?.isLike ?? null,
        reactions: undefined,
      }));

      return {
        comments: commentsWithReaction,
        nextCursor,
      };
    }),

  // 获取评论的回复
  getReplies: publicProcedure
    .input(
      z.object({
        commentId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .handler(async ({ context, input }) => {
      const { commentId, cursor, limit } = input;

      const replies = await context.db.query.comment.findMany({
        with: {
          user: { columns: { id: true, username: true, nickname: true, avatar: true } },
          replyToUser: { columns: { id: true, username: true, nickname: true } },
          reactions: context.session?.user
            ? {
                columns: { isLike: true },
                where: and(eq(schema.commentReaction.userId, context.session.user.id)),
              }
            : undefined,
        },
        where: and(
          and(
            eq(schema.comment.parentId, commentId),
            eq(schema.comment.isDeleted, false),
            eq(schema.comment.isHidden, false),
          ),
          cursorCondition(schema.comment, (cursor ? { id: cursor } : undefined)?.id, [
            { column: schema.comment.createdAt, direction: "asc" },
          ]),
        ),
        orderBy: [asc(schema.comment.createdAt), desc(schema.comment.id)],
        limit: limit + 1,
      });

      let nextCursor: string | undefined;
      if (replies.length > limit) {
        const nextItem = replies.pop();
        nextCursor = nextItem?.id;
      }

      const repliesWithReaction = replies.map((reply) => ({
        ...reply,
        userReaction: reply.reactions?.[0]?.isLike ?? null,
        reactions: undefined,
      }));

      return {
        replies: repliesWithReaction,
        nextCursor,
      };
    }),

  // 获取评论数量
  getCount: publicProcedure
    .input(z.object({ videoId: z.string() }))
    .handler(async ({ context, input }) => {
      const count = await context.db.$count(
        schema.comment,
        and(
          eq(schema.comment.videoId, input.videoId),
          eq(schema.comment.isDeleted, false),
          eq(schema.comment.isHidden, false),
        ),
      );
      return count;
    }),

  // 发表评论
  create: protectedProcedure
    .input(
      z.object({
        videoId: z.string(),
        content: z.string().min(1).max(2000),
        parentId: z.string().optional(),
        replyToUserId: z.string().optional(), // 回复的目标用户
        gpsLocation: z.string().optional(),
        deviceInfo: z
          .object({
            deviceType: z.string().nullable().optional(),
            os: z.string().nullable().optional(),
            osVersion: z.string().nullable().optional(),
            browser: z.string().nullable().optional(),
            browserVersion: z.string().nullable().optional(),
            brand: z.string().nullable().optional(),
            model: z.string().nullable().optional(),
            platform: z.string().nullable().optional(),
            language: z.string().nullable().optional(),
            timezone: z.string().nullable().optional(),
            screen: z.string().nullable().optional(),
            pixelRatio: z.number().nullable().optional(),
            userAgent: z.string().nullable().optional(),
            fingerprint: z.string().optional(),
          })
          .optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const { videoId, content, parentId, replyToUserId, gpsLocation, deviceInfo } = input;
      const userId = context.session.user.id;

      // 获取 IPv4 和 IPv6 位置
      const [ipv4Location, ipv6Location] = await Promise.all([
        getIpLocation(context.ipv4Address),
        getIpLocation(context.ipv6Address),
      ]);

      // 如果客户端传递了设备信息（包含高精度版本），直接使用
      // 否则用 User-Agent 解析（精度较低）
      let normalizedDeviceInfo: DeviceInfo;
      if (deviceInfo?.os && deviceInfo.osVersion) {
        // 客户端传递了完整的高精度设备信息，直接使用
        normalizedDeviceInfo = {
          deviceType: deviceInfo.deviceType || "desktop",
          os: deviceInfo.os,
          osVersion: deviceInfo.osVersion,
          browser: deviceInfo.browser || null,
          browserVersion: deviceInfo.browserVersion || null,
          brand: deviceInfo.brand || null,
          model: deviceInfo.model || null,
          platform: deviceInfo.platform || null,
          language: deviceInfo.language || null,
          timezone: deviceInfo.timezone || null,
          screen: deviceInfo.screen || null,
          pixelRatio: deviceInfo.pixelRatio || null,
          userAgent: deviceInfo.userAgent || context.userAgent || null,
          fingerprint: deviceInfo.fingerprint || "unknown",
        };
      } else {
        // 回退到 User-Agent 解析
        normalizedDeviceInfo = parseDeviceInfo(context.userAgent, deviceInfo);
      }

      // 验证视频存在
      const video = await context.db.query.video
        .findFirst({
          columns: { id: true, status: true },
          where: and(eq(schema.video.id, videoId)),
        })
        .then((row) => row ?? null);

      if (video?.status !== "PUBLISHED") {
        throw new ORPCError("NOT_FOUND", { message: "视频不存在" });
      }

      // 如果是回复，验证父评论存在
      if (parentId) {
        const parentComment = await context.db.query.comment
          .findFirst({
            columns: { id: true, videoId: true, isDeleted: true, userId: true },
            where: and(eq(schema.comment.id, parentId)),
          })
          .then((row) => row ?? null);

        if (!parentComment || parentComment.isDeleted || parentComment.videoId !== videoId) {
          throw new ORPCError("NOT_FOUND", { message: "评论不存在" });
        }
      }

      const comment = await (async () => {
        const inserted = requiredRow(
          await context.db
            .insert(schema.comment)
            .values({
              content: content,
              userId: userId,
              videoId: videoId,
              parentId: parentId,
              replyToUserId: replyToUserId,
              ipv4Address: context.ipv4Address,
              ipv4Location: ipv4Location,
              ipv6Address: context.ipv6Address,
              ipv6Location: ipv6Location,
              gpsLocation: gpsLocation,
              deviceInfo: { ...normalizedDeviceInfo },
              userAgent: context.userAgent,
            })
            .returning(),
        );
        return requiredRow(
          await context.db.query.comment.findFirst({
            ...{
              with: {
                user: { columns: { id: true, username: true, nickname: true, avatar: true } },
                replyToUser: { columns: { id: true, username: true, nickname: true } },
              },
              extras: (row) => ({
                _count: sql<{
                  replies: number;
                }>`json_build_object('replies', (select count(*)::int from "Comment" as "count_replies" where "count_replies"."parentId" = ${sql`${row.id}`}))`.as(
                  "_count",
                ),
              }),
            },
            where: eq(schema.comment.id, inserted.id),
          }),
        );
      })();

      // 更新用户最近位置（优先使用 IPv4，其次 IPv6）
      const lastIpLocation = ipv4Location || ipv6Location;
      await context.db
        .update(schema.user)
        .set({
          lastIpLocation: lastIpLocation || undefined,
          lastGpsLocation: gpsLocation || undefined,
        })
        .where(and(eq(schema.user.id, userId)))
        .returning()
        .then((rows) => requiredRow(rows));

      // 记录设备历史
      await context.db
        .insert(schema.userDevice)
        .values({
          userId: userId,
          fingerprint: normalizedDeviceInfo.fingerprint,
          deviceType: normalizedDeviceInfo.deviceType,
          os: normalizedDeviceInfo.os,
          osVersion: normalizedDeviceInfo.osVersion,
          browser: normalizedDeviceInfo.browser,
          browserVersion: normalizedDeviceInfo.browserVersion,
          brand: normalizedDeviceInfo.brand,
          model: normalizedDeviceInfo.model,
          userAgent: normalizedDeviceInfo.userAgent,
          ipv4Address: context.ipv4Address,
          ipv4Location: ipv4Location,
          ipv6Address: context.ipv6Address,
          ipv6Location: ipv6Location,
          gpsLocation: gpsLocation,
        })
        .onConflictDoUpdate({
          target: [schema.userDevice.userId, schema.userDevice.fingerprint],
          set: {
            deviceType: normalizedDeviceInfo.deviceType,
            os: normalizedDeviceInfo.os,
            osVersion: normalizedDeviceInfo.osVersion,
            browser: normalizedDeviceInfo.browser,
            browserVersion: normalizedDeviceInfo.browserVersion,
            brand: normalizedDeviceInfo.brand,
            model: normalizedDeviceInfo.model,
            userAgent: normalizedDeviceInfo.userAgent,
            ipv4Address: context.ipv4Address,
            ipv4Location: ipv4Location,
            ipv6Address: context.ipv6Address,
            ipv6Location: ipv6Location,
            gpsLocation: gpsLocation,
            lastActiveAt: new Date(),
          },
        })
        .returning()
        .then((rows) => requiredRow(rows));

      return {
        ...comment,
        userReaction: null,
      };
    }),

  // 编辑评论
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        content: z.string().min(1).max(2000),
      }),
    )
    .handler(async ({ context, input }) => {
      const { id, content } = input;
      const userId = context.session.user.id;

      const comment = await context.db.query.comment
        .findFirst({
          columns: { userId: true, isDeleted: true },
          where: and(eq(schema.comment.id, id)),
        })
        .then((row) => row ?? null);

      if (!comment || comment.isDeleted) {
        throw new ORPCError("NOT_FOUND", { message: "评论不存在" });
      }

      if (comment.userId !== userId) {
        throw new ORPCError("FORBIDDEN", { message: "无权编辑此评论" });
      }

      const updated = await context.db
        .update(schema.comment)
        .set({ content: content, isEdited: true })
        .where(and(eq(schema.comment.id, id)))
        .returning()
        .then((rows) => requiredRow(rows));

      return updated;
    }),

  // 删除评论
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      const comment = await context.db.query.comment
        .findFirst({
          columns: { userId: true, isDeleted: true },
          where: and(eq(schema.comment.id, input.id)),
        })
        .then((row) => row ?? null);

      if (!comment || comment.isDeleted) {
        throw new ORPCError("NOT_FOUND", { message: "评论不存在" });
      }

      // 只有评论作者或管理员可以删除
      const isOwner = comment.userId === userId;

      if (!isOwner && !(await hasAdminScope(context.db, userId, "comment:manage"))) {
        throw new ORPCError("FORBIDDEN", { message: "无权删除此评论" });
      }

      // 软删除
      await context.db
        .update(schema.comment)
        .set({ isDeleted: true })
        .where(and(eq(schema.comment.id, input.id)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),

  // 点赞/踩评论
  react: protectedProcedure
    .input(
      z.object({
        commentId: z.string(),
        isLike: z.boolean().nullable(), // null = 取消反应
      }),
    )
    .handler(async ({ context, input }) => {
      return context.db.transaction(async (tx) => {
        const { commentId, isLike } = input;
        const userId = context.session.user.id;

        const comment = (
          await tx
            .select()
            .from(schema.comment)
            .where(eq(schema.comment.id, commentId))
            .for("update")
        )[0];

        if (!comment || comment.isDeleted) {
          throw new ORPCError("NOT_FOUND", { message: "评论不存在" });
        }

        // 查找现有反应
        const existingReaction = await tx.query.commentReaction
          .findFirst({
            where: and(
              and(
                eq(schema.commentReaction.userId, userId),
                eq(schema.commentReaction.commentId, commentId),
              ),
            ),
          })
          .then((row) => row ?? null);

        let likeDelta = 0;
        let dislikeDelta = 0;

        if (isLike === null) {
          // 取消反应
          if (existingReaction) {
            await tx
              .delete(schema.commentReaction)
              .where(and(eq(schema.commentReaction.id, existingReaction.id)))
              .returning()
              .then((rows) => requiredRow(rows));
            likeDelta = existingReaction.isLike ? -1 : 0;
            dislikeDelta = existingReaction.isLike ? 0 : -1;
          }
        } else if (existingReaction) {
          // 更新反应
          if (existingReaction.isLike !== isLike) {
            await tx
              .update(schema.commentReaction)
              .set({ isLike: isLike })
              .where(and(eq(schema.commentReaction.id, existingReaction.id)))
              .returning()
              .then((rows) => requiredRow(rows));
            likeDelta = isLike ? 1 : -1;
            dislikeDelta = isLike ? -1 : 1;
          }
        } else {
          // 创建新反应
          await tx
            .insert(schema.commentReaction)
            .values({ userId: userId, commentId: commentId, isLike: isLike })
            .returning()
            .then((rows) => requiredRow(rows));
          likeDelta = isLike ? 1 : 0;
          dislikeDelta = isLike ? 0 : 1;
        }

        // 更新评论的点赞/踩计数
        if (likeDelta !== 0 || dislikeDelta !== 0) {
          await tx
            .update(schema.comment)
            .set({
              likes: sql`${schema.comment.likes} + ${likeDelta}`,
              dislikes: sql`${schema.comment.dislikes} + ${dislikeDelta}`,
            })
            .where(and(eq(schema.comment.id, commentId)))
            .returning()
            .then((rows) => requiredRow(rows));
        }

        return {
          likes: comment.likes + likeDelta,
          dislikes: comment.dislikes + dislikeDelta,
          userReaction: isLike,
        };
      });
    }),

  // 置顶评论（仅视频上传者/管理员）
  pin: protectedProcedure
    .input(
      z.object({
        commentId: z.string(),
        isPinned: z.boolean(),
      }),
    )
    .handler(async ({ context, input }) => {
      const { commentId, isPinned } = input;
      const userId = context.session.user.id;

      const comment = await context.db.query.comment
        .findFirst({
          with: { video: { columns: { uploaderId: true } } },
          where: and(eq(schema.comment.id, commentId)),
        })
        .then((row) => row ?? null);

      if (!comment || comment.isDeleted) {
        throw new ORPCError("NOT_FOUND", { message: "评论不存在" });
      }

      // 只有视频上传者或管理员可以置顶
      const isUploader = comment.video.uploaderId === userId;

      if (!isUploader && !(await hasAdminScope(context.db, userId, "comment:manage"))) {
        throw new ORPCError("FORBIDDEN", { message: "无权置顶评论" });
      }

      // 如果要置顶，先取消其他置顶
      if (isPinned) {
        await context.db
          .update(schema.comment)
          .set({ isPinned: false })
          .where(
            and(eq(schema.comment.videoId, comment.videoId), eq(schema.comment.isPinned, true)),
          )
          .returning()
          .then((rows) => ({ count: rows.length }));
      }

      await context.db
        .update(schema.comment)
        .set({ isPinned: isPinned })
        .where(and(eq(schema.comment.id, commentId)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),
};
