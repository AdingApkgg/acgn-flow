import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import { getIpLocation } from "@/lib/ip-location";
import { parseDeviceInfo, type DeviceInfo } from "@/lib/device-info";

const SortType = z.enum(["newest", "oldest", "popular"]);

export const guestbookRouter = router({
  // 获取留言列表
  list: publicProcedure
    .input(
      z.object({
        sort: SortType.default("newest"),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { sort, cursor, limit } = input;

      const orderBy = (() => {
        switch (sort) {
          case "oldest":
            return { createdAt: "asc" as const };
          case "popular":
            return { likes: "desc" as const };
          default:
            return { createdAt: "desc" as const };
        }
      })();

      const messages = await ctx.prisma.guestbook.findMany({
        where: {
          parentId: null,
          isDeleted: false,
          isHidden: false,
        },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatar: true,
            },
          },
          replyToUser: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          _count: {
            select: { replies: true },
          },
          reactions: ctx.session?.user
            ? {
                where: { userId: ctx.session.user.id },
                select: { isLike: true },
              }
            : false,
        },
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
      })
    )
    .query(async ({ ctx, input }) => {
      const { messageId, cursor, limit } = input;

      const replies = await ctx.prisma.guestbook.findMany({
        where: {
          parentId: messageId,
          isDeleted: false,
          isHidden: false,
        },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: "asc" },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatar: true,
            },
          },
          replyToUser: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          reactions: ctx.session?.user
            ? {
                where: { userId: ctx.session.user.id },
                select: { isLike: true },
              }
            : false,
        },
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
  getCount: publicProcedure.query(async ({ ctx }) => {
    const count = await ctx.prisma.guestbook.count({
      where: {
        isDeleted: false,
        isHidden: false,
      },
    });
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { content, parentId, replyToUserId, gpsLocation, deviceInfo } = input;
      const userId = ctx.session.user.id;

      const [ipv4Location, ipv6Location] = await Promise.all([
        getIpLocation(ctx.ipv4Address),
        getIpLocation(ctx.ipv6Address),
      ]);

      let normalizedDeviceInfo: DeviceInfo;
      if (deviceInfo && deviceInfo.os && deviceInfo.osVersion) {
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
          userAgent: deviceInfo.userAgent || ctx.userAgent || null,
          fingerprint: deviceInfo.fingerprint || "unknown",
        };
      } else {
        normalizedDeviceInfo = parseDeviceInfo(ctx.userAgent, deviceInfo);
      }

      if (parentId) {
        const parentMessage = await ctx.prisma.guestbook.findUnique({
          where: { id: parentId },
          select: { id: true, isDeleted: true },
        });

        if (!parentMessage || parentMessage.isDeleted) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "留言不存在",
          });
        }
      }

      const message = await ctx.prisma.guestbook.create({
        data: {
          content,
          userId,
          parentId,
          replyToUserId,
          ipv4Address: ctx.ipv4Address,
          ipv4Location,
          ipv6Address: ctx.ipv6Address,
          ipv6Location,
          gpsLocation,
          deviceInfo: normalizedDeviceInfo as unknown as Prisma.InputJsonValue,
          userAgent: ctx.userAgent,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatar: true,
            },
          },
          replyToUser: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
          _count: {
            select: { replies: true },
          },
        },
      });

      const lastIpLocation = ipv4Location || ipv6Location;
      await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          lastIpLocation: lastIpLocation || undefined,
          lastGpsLocation: gpsLocation || undefined,
        },
      });

      await ctx.prisma.userDevice.upsert({
        where: {
          userId_fingerprint: {
            userId,
            fingerprint: normalizedDeviceInfo.fingerprint,
          },
        },
        update: {
          deviceType: normalizedDeviceInfo.deviceType,
          os: normalizedDeviceInfo.os,
          osVersion: normalizedDeviceInfo.osVersion,
          browser: normalizedDeviceInfo.browser,
          browserVersion: normalizedDeviceInfo.browserVersion,
          brand: normalizedDeviceInfo.brand,
          model: normalizedDeviceInfo.model,
          userAgent: normalizedDeviceInfo.userAgent,
          ipv4Address: ctx.ipv4Address,
          ipv4Location,
          ipv6Address: ctx.ipv6Address,
          ipv6Location,
          gpsLocation,
          lastActiveAt: new Date(),
        },
        create: {
          userId,
          fingerprint: normalizedDeviceInfo.fingerprint,
          deviceType: normalizedDeviceInfo.deviceType,
          os: normalizedDeviceInfo.os,
          osVersion: normalizedDeviceInfo.osVersion,
          browser: normalizedDeviceInfo.browser,
          browserVersion: normalizedDeviceInfo.browserVersion,
          brand: normalizedDeviceInfo.brand,
          model: normalizedDeviceInfo.model,
          userAgent: normalizedDeviceInfo.userAgent,
          ipv4Address: ctx.ipv4Address,
          ipv4Location,
          ipv6Address: ctx.ipv6Address,
          ipv6Location,
          gpsLocation,
        },
      });

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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, content } = input;
      const userId = ctx.session.user.id;

      const message = await ctx.prisma.guestbook.findUnique({
        where: { id },
        select: { userId: true, isDeleted: true },
      });

      if (!message || message.isDeleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "留言不存在",
        });
      }

      if (message.userId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "无权编辑此留言",
        });
      }

      const updated = await ctx.prisma.guestbook.update({
        where: { id },
        data: {
          content,
          isEdited: true,
        },
      });

      return updated;
    }),

  // 删除留言
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const userRole = ctx.session.user.role;

      const message = await ctx.prisma.guestbook.findUnique({
        where: { id: input.id },
        select: { userId: true, isDeleted: true },
      });

      if (!message || message.isDeleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "留言不存在",
        });
      }

      const isOwner = message.userId === userId;
      const isAdmin = userRole === "ADMIN" || userRole === "OWNER";

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "无权删除此留言",
        });
      }

      await ctx.prisma.guestbook.update({
        where: { id: input.id },
        data: { isDeleted: true },
      });

      return { success: true };
    }),

  // 点赞/踩留言
  react: protectedProcedure
    .input(
      z.object({
        messageId: z.string(),
        isLike: z.boolean().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { messageId, isLike } = input;
      const userId = ctx.session.user.id;

      const message = await ctx.prisma.guestbook.findUnique({
        where: { id: messageId },
        select: { id: true, likes: true, dislikes: true, isDeleted: true },
      });

      if (!message || message.isDeleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "留言不存在",
        });
      }

      const existingReaction = await ctx.prisma.guestbookReaction.findUnique({
        where: {
          userId_guestbookId: { userId, guestbookId: messageId },
        },
      });

      let likeDelta = 0;
      let dislikeDelta = 0;

      if (isLike === null) {
        if (existingReaction) {
          await ctx.prisma.guestbookReaction.delete({
            where: { id: existingReaction.id },
          });
          likeDelta = existingReaction.isLike ? -1 : 0;
          dislikeDelta = existingReaction.isLike ? 0 : -1;
        }
      } else if (existingReaction) {
        if (existingReaction.isLike !== isLike) {
          await ctx.prisma.guestbookReaction.update({
            where: { id: existingReaction.id },
            data: { isLike },
          });
          likeDelta = isLike ? 1 : -1;
          dislikeDelta = isLike ? -1 : 1;
        }
      } else {
        await ctx.prisma.guestbookReaction.create({
          data: { userId, guestbookId: messageId, isLike },
        });
        likeDelta = isLike ? 1 : 0;
        dislikeDelta = isLike ? 0 : 1;
      }

      if (likeDelta !== 0 || dislikeDelta !== 0) {
        await ctx.prisma.guestbook.update({
          where: { id: messageId },
          data: {
            likes: { increment: likeDelta },
            dislikes: { increment: dislikeDelta },
          },
        });
      }

      return {
        likes: message.likes + likeDelta,
        dislikes: message.dislikes + dislikeDelta,
        userReaction: isLike,
      };
    }),

  // 置顶留言（仅管理员）
  pin: protectedProcedure
    .input(
      z.object({
        messageId: z.string(),
        isPinned: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { messageId, isPinned } = input;
      const userRole = ctx.session.user.role;

      const isAdmin = userRole === "ADMIN" || userRole === "OWNER";
      if (!isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "无权置顶留言",
        });
      }

      const message = await ctx.prisma.guestbook.findUnique({
        where: { id: messageId },
      });

      if (!message || message.isDeleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "留言不存在",
        });
      }

      if (isPinned) {
        await ctx.prisma.guestbook.updateMany({
          where: { isPinned: true },
          data: { isPinned: false },
        });
      }

      await ctx.prisma.guestbook.update({
        where: { id: messageId },
        data: { isPinned },
      });

      return { success: true };
    }),
});
