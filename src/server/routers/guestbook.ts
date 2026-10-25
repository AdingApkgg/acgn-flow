import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/db/schema";
import { type DeviceInfo, parseDeviceInfo } from "@/lib/device-info";
import { getIpLocation } from "@/lib/ip-location";
import { protectedProcedure, publicProcedure } from "../orpc";
import { hasAdminScope } from "../services/permissions";
import { cursorCondition, requiredRow } from "../services/query";

const SortType = z.enum(["newest", "oldest", "popular"]);

export const guestbookRouter = {
  // 获取留言列表
  list: publicProcedure
    .input(
      z.object({
        sort: SortType.default("newest"),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .handler(async ({ context, input }) => {
      const { sort, cursor, limit } = input;

      const sortColumn = sort === "popular" ? schema.guestbook.likes : schema.guestbook.createdAt;
      const direction = sort === "oldest" ? "asc" : "desc";
      const orderBy = [
        direction === "asc" ? asc(sortColumn) : desc(sortColumn),
        desc(schema.guestbook.id),
      ];

      const messages = await context.db.query.guestbook.findMany({
        with: {
          user: { columns: { id: true, username: true, nickname: true, avatar: true } },
          replyToUser: { columns: { id: true, username: true, nickname: true } },
          reactions: context.session?.user
            ? {
                columns: { isLike: true },
                where: and(eq(schema.guestbookReaction.userId, context.session.user.id)),
              }
            : undefined,
        },
        extras: (row) => ({
          _count: sql<{
            replies: number;
          }>`json_build_object('replies', (select count(*)::int from "Guestbook" as "count_replies" where "count_replies"."parentId" = ${sql`${row.id}`}))`.as(
            "_count",
          ),
        }),
        where: and(
          and(
            isNull(schema.guestbook.parentId),
            eq(schema.guestbook.isDeleted, false),
            eq(schema.guestbook.isHidden, false),
          ),
          cursorCondition(schema.guestbook, (cursor ? { id: cursor } : undefined)?.id, [
            { column: sortColumn, direction: direction },
          ]),
        ),
        orderBy,
        limit: limit + 1,
      });

      let nextCursor: string | undefined;
      if (messages.length > limit) {
        const nextItem = messages.pop();
        nextCursor = nextItem?.id;
      }

      const messagesWithReaction = messages.map((msg) => ({
        ...msg,
        userReaction: msg.reactions?.[0]?.isLike ?? null,
        reactions: undefined,
      }));

      return {
        messages: messagesWithReaction,
        nextCursor,
      };
    }),

  // 获取留言的回复
  getReplies: publicProcedure
    .input(
      z.object({
        messageId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .handler(async ({ context, input }) => {
      const { messageId, cursor, limit } = input;

      const replies = await context.db.query.guestbook.findMany({
        with: {
          user: { columns: { id: true, username: true, nickname: true, avatar: true } },
          replyToUser: { columns: { id: true, username: true, nickname: true } },
          reactions: context.session?.user
            ? {
                columns: { isLike: true },
                where: and(eq(schema.guestbookReaction.userId, context.session.user.id)),
              }
            : undefined,
        },
        where: and(
          and(
            eq(schema.guestbook.parentId, messageId),
            eq(schema.guestbook.isDeleted, false),
            eq(schema.guestbook.isHidden, false),
          ),
          cursorCondition(schema.guestbook, (cursor ? { id: cursor } : undefined)?.id, [
            { column: schema.guestbook.createdAt, direction: "asc" },
          ]),
        ),
        orderBy: [asc(schema.guestbook.createdAt), desc(schema.guestbook.id)],
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

  // 获取留言数量
  getCount: publicProcedure.handler(async ({ context }) => {
    const count = await context.db.$count(
      schema.guestbook,
      and(eq(schema.guestbook.isDeleted, false), eq(schema.guestbook.isHidden, false)),
    );
    return count;
  }),

  // 发表留言
  create: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1).max(2000),
        parentId: z.string().optional(),
        replyToUserId: z.string().optional(),
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
      const { content, parentId, replyToUserId, gpsLocation, deviceInfo } = input;
      const userId = context.session.user.id;

      const [ipv4Location, ipv6Location] = await Promise.all([
        getIpLocation(context.ipv4Address),
        getIpLocation(context.ipv6Address),
      ]);

      let normalizedDeviceInfo: DeviceInfo;
      if (deviceInfo?.os && deviceInfo.osVersion) {
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
        normalizedDeviceInfo = parseDeviceInfo(context.userAgent, deviceInfo);
      }

      if (parentId) {
        const parentMessage = await context.db.query.guestbook
          .findFirst({
            columns: { id: true, isDeleted: true },
            where: and(eq(schema.guestbook.id, parentId)),
          })
          .then((row) => row ?? null);

        if (!parentMessage || parentMessage.isDeleted) {
          throw new ORPCError("NOT_FOUND", { message: "留言不存在" });
        }
      }

      const message = await (async () => {
        const inserted = requiredRow(
          await context.db
            .insert(schema.guestbook)
            .values({
              content: content,
              userId: userId,
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
          await context.db.query.guestbook.findFirst({
            ...{
              with: {
                user: { columns: { id: true, username: true, nickname: true, avatar: true } },
                replyToUser: { columns: { id: true, username: true, nickname: true } },
              },
              extras: (row) => ({
                _count: sql<{
                  replies: number;
                }>`json_build_object('replies', (select count(*)::int from "Guestbook" as "count_replies" where "count_replies"."parentId" = ${sql`${row.id}`}))`.as(
                  "_count",
                ),
              }),
            },
            where: eq(schema.guestbook.id, inserted.id),
          }),
        );
      })();

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
        ...message,
        userReaction: null,
      };
    }),

  // 编辑留言
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

      const message = await context.db.query.guestbook
        .findFirst({
          columns: { userId: true, isDeleted: true },
          where: and(eq(schema.guestbook.id, id)),
        })
        .then((row) => row ?? null);

      if (!message || message.isDeleted) {
        throw new ORPCError("NOT_FOUND", { message: "留言不存在" });
      }

      if (message.userId !== userId) {
        throw new ORPCError("FORBIDDEN", { message: "无权编辑此留言" });
      }

      const updated = await context.db
        .update(schema.guestbook)
        .set({ content: content, isEdited: true })
        .where(and(eq(schema.guestbook.id, id)))
        .returning()
        .then((rows) => requiredRow(rows));

      return updated;
    }),

  // 删除留言
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      const message = await context.db.query.guestbook
        .findFirst({
          columns: { userId: true, isDeleted: true },
          where: and(eq(schema.guestbook.id, input.id)),
        })
        .then((row) => row ?? null);

      if (!message || message.isDeleted) {
        throw new ORPCError("NOT_FOUND", { message: "留言不存在" });
      }

      const isOwner = message.userId === userId;

      if (!isOwner && !(await hasAdminScope(context.db, userId, "comment:manage"))) {
        throw new ORPCError("FORBIDDEN", { message: "无权删除此留言" });
      }

      await context.db
        .update(schema.guestbook)
        .set({ isDeleted: true })
        .where(and(eq(schema.guestbook.id, input.id)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),

  // 点赞/踩留言
  react: protectedProcedure
    .input(
      z.object({
        messageId: z.string(),
        isLike: z.boolean().nullable(),
      }),
    )
    .handler(async ({ context, input }) => {
      return context.db.transaction(async (tx) => {
        const { messageId, isLike } = input;
        const userId = context.session.user.id;

        const message = (
          await tx
            .select()
            .from(schema.guestbook)
            .where(eq(schema.guestbook.id, messageId))
            .for("update")
        )[0];

        if (!message || message.isDeleted) {
          throw new ORPCError("NOT_FOUND", { message: "留言不存在" });
        }

        const existingReaction = await tx.query.guestbookReaction
          .findFirst({
            where: and(
              and(
                eq(schema.guestbookReaction.userId, userId),
                eq(schema.guestbookReaction.guestbookId, messageId),
              ),
            ),
          })
          .then((row) => row ?? null);

        let likeDelta = 0;
        let dislikeDelta = 0;

        if (isLike === null) {
          if (existingReaction) {
            await tx
              .delete(schema.guestbookReaction)
              .where(and(eq(schema.guestbookReaction.id, existingReaction.id)))
              .returning()
              .then((rows) => requiredRow(rows));
            likeDelta = existingReaction.isLike ? -1 : 0;
            dislikeDelta = existingReaction.isLike ? 0 : -1;
          }
        } else if (existingReaction) {
          if (existingReaction.isLike !== isLike) {
            await tx
              .update(schema.guestbookReaction)
              .set({ isLike: isLike })
              .where(and(eq(schema.guestbookReaction.id, existingReaction.id)))
              .returning()
              .then((rows) => requiredRow(rows));
            likeDelta = isLike ? 1 : -1;
            dislikeDelta = isLike ? -1 : 1;
          }
        } else {
          await tx
            .insert(schema.guestbookReaction)
            .values({ userId: userId, guestbookId: messageId, isLike: isLike })
            .returning()
            .then((rows) => requiredRow(rows));
          likeDelta = isLike ? 1 : 0;
          dislikeDelta = isLike ? 0 : 1;
        }

        if (likeDelta !== 0 || dislikeDelta !== 0) {
          await tx
            .update(schema.guestbook)
            .set({
              likes: sql`${schema.guestbook.likes} + ${likeDelta}`,
              dislikes: sql`${schema.guestbook.dislikes} + ${dislikeDelta}`,
            })
            .where(and(eq(schema.guestbook.id, messageId)))
            .returning()
            .then((rows) => requiredRow(rows));
        }

        return {
          likes: message.likes + likeDelta,
          dislikes: message.dislikes + dislikeDelta,
          userReaction: isLike,
        };
      });
    }),

  // 置顶留言（仅管理员）
  pin: protectedProcedure
    .input(
      z.object({
        messageId: z.string(),
        isPinned: z.boolean(),
      }),
    )
    .handler(async ({ context, input }) => {
      const { messageId, isPinned } = input;

      if (!(await hasAdminScope(context.db, context.session.user.id, "comment:manage"))) {
        throw new ORPCError("FORBIDDEN", { message: "无权置顶留言" });
      }

      const message = await context.db.query.guestbook
        .findFirst({ where: and(eq(schema.guestbook.id, messageId)) })
        .then((row) => row ?? null);

      if (!message || message.isDeleted) {
        throw new ORPCError("NOT_FOUND", { message: "留言不存在" });
      }

      if (isPinned) {
        await context.db
          .update(schema.guestbook)
          .set({ isPinned: false })
          .where(and(eq(schema.guestbook.isPinned, true)))
          .returning()
          .then((rows) => ({ count: rows.length }));
      }

      await context.db
        .update(schema.guestbook)
        .set({ isPinned: isPinned })
        .where(and(eq(schema.guestbook.id, messageId)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),
};
