import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import { getIpLocation } from "@/lib/ip-location";
import { parseDeviceInfo, type DeviceInfo } from "@/lib/device-info";

// 排序类型
const SortType = z.enum(["newest", "oldest", "popular"]);

export const commentRouter = router({
  // 获取视频评论列表
  list: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
        sort: SortType.default("newest"),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { videoId, sort, cursor, limit } = input;

      // 构建排序条件
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

      // 查询顶级评论（parentId 为 null）
      const comments = await ctx.prisma.comment.findMany({
        where: {
          videoId,
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
      })
    )
    .query(async ({ ctx, input }) => {
      const { commentId, cursor, limit } = input;

      const replies = await ctx.prisma.comment.findMany({
        where: {
          parentId: commentId,
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

  // 获取评论数量
  getCount: publicProcedure
    .input(z.object({ videoId: z.string() }))
    .query(async ({ ctx, input }) => {
      const count = await ctx.prisma.comment.count({
        where: {
          videoId: input.videoId,
          isDeleted: false,
          isHidden: false,
        },
      });
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { videoId, content, parentId, replyToUserId, gpsLocation, deviceInfo } = input;
      const userId = ctx.session.user.id;
      
      // 获取 IPv4 和 IPv6 位置
      const [ipv4Location, ipv6Location] = await Promise.all([
        getIpLocation(ctx.ipv4Address),
        getIpLocation(ctx.ipv6Address),
      ]);
      
      // 如果客户端传递了设备信息（包含高精度版本），直接使用
      // 否则用 User-Agent 解析（精度较低）
      let normalizedDeviceInfo: DeviceInfo;
      if (deviceInfo && deviceInfo.os && deviceInfo.osVersion) {
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
          userAgent: deviceInfo.userAgent || ctx.userAgent || null,
          fingerprint: deviceInfo.fingerprint || "unknown",
        };
      } else {
        // 回退到 User-Agent 解析
        normalizedDeviceInfo = parseDeviceInfo(ctx.userAgent, deviceInfo);
      }

      // 验证视频存在
      const video = await ctx.prisma.video.findUnique({
        where: { id: videoId },
        select: { id: true, status: true },
      });

      if (!video || video.status !== "PUBLISHED") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "视频不存在",
        });
      }

      // 如果是回复，验证父评论存在
      if (parentId) {
        const parentComment = await ctx.prisma.comment.findUnique({
          where: { id: parentId },
          select: { id: true, videoId: true, isDeleted: true, userId: true },
        });

        if (!parentComment || parentComment.isDeleted || parentComment.videoId !== videoId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "评论不存在",
          });
        }
      }

      const comment = await ctx.prisma.comment.create({
        data: {
          content,
          userId,
          videoId,
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

      // 更新用户最近位置（优先使用 IPv4，其次 IPv6）
      const lastIpLocation = ipv4Location || ipv6Location;
      await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          lastIpLocation: lastIpLocation || undefined,
          lastGpsLocation: gpsLocation || undefined,
        },
      });

      // 记录设备历史
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, content } = input;
      const userId = ctx.session.user.id;

      const comment = await ctx.prisma.comment.findUnique({
        where: { id },
        select: { userId: true, isDeleted: true },
      });

      if (!comment || comment.isDeleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "评论不存在",
        });
      }

      if (comment.userId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "无权编辑此评论",
        });
      }

      const updated = await ctx.prisma.comment.update({
        where: { id },
        data: {
          content,
          isEdited: true,
        },
      });

      return updated;
    }),

  // 删除评论
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const userRole = ctx.session.user.role;

      const comment = await ctx.prisma.comment.findUnique({
        where: { id: input.id },
        select: { userId: true, isDeleted: true },
      });

      if (!comment || comment.isDeleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "评论不存在",
        });
      }

      // 只有评论作者或管理员可以删除
      const isOwner = comment.userId === userId;
      const isAdmin = userRole === "ADMIN" || userRole === "OWNER";

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "无权删除此评论",
        });
      }

      // 软删除
      await ctx.prisma.comment.update({
        where: { id: input.id },
        data: { isDeleted: true },
      });

      return { success: true };
    }),

  // 点赞/踩评论
  react: protectedProcedure
    .input(
      z.object({
        commentId: z.string(),
        isLike: z.boolean().nullable(), // null = 取消反应
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { commentId, isLike } = input;
      const userId = ctx.session.user.id;

      const comment = await ctx.prisma.comment.findUnique({
        where: { id: commentId },
        select: { id: true, likes: true, dislikes: true, isDeleted: true },
      });

      if (!comment || comment.isDeleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "评论不存在",
        });
      }

      // 查找现有反应
      const existingReaction = await ctx.prisma.commentReaction.findUnique({
        where: {
          userId_commentId: { userId, commentId },
        },
      });

      let likeDelta = 0;
      let dislikeDelta = 0;

      if (isLike === null) {
        // 取消反应
        if (existingReaction) {
          await ctx.prisma.commentReaction.delete({
            where: { id: existingReaction.id },
          });
          likeDelta = existingReaction.isLike ? -1 : 0;
          dislikeDelta = existingReaction.isLike ? 0 : -1;
        }
      } else if (existingReaction) {
        // 更新反应
        if (existingReaction.isLike !== isLike) {
          await ctx.prisma.commentReaction.update({
            where: { id: existingReaction.id },
            data: { isLike },
          });
          likeDelta = isLike ? 1 : -1;
          dislikeDelta = isLike ? -1 : 1;
        }
      } else {
        // 创建新反应
        await ctx.prisma.commentReaction.create({
          data: { userId, commentId, isLike },
        });
        likeDelta = isLike ? 1 : 0;
        dislikeDelta = isLike ? 0 : 1;
      }

      // 更新评论的点赞/踩计数
      if (likeDelta !== 0 || dislikeDelta !== 0) {
        await ctx.prisma.comment.update({
          where: { id: commentId },
          data: {
            likes: { increment: likeDelta },
            dislikes: { increment: dislikeDelta },
          },
        });
      }

      return {
        likes: comment.likes + likeDelta,
        dislikes: comment.dislikes + dislikeDelta,
        userReaction: isLike,
      };
    }),

  // 置顶评论（仅视频上传者/管理员）
  pin: protectedProcedure
    .input(
      z.object({
        commentId: z.string(),
        isPinned: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { commentId, isPinned } = input;
      const userId = ctx.session.user.id;
      const userRole = ctx.session.user.role;

      const comment = await ctx.prisma.comment.findUnique({
        where: { id: commentId },
        include: {
          video: {
            select: { uploaderId: true },
          },
        },
      });

      if (!comment || comment.isDeleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "评论不存在",
        });
      }

      // 只有视频上传者或管理员可以置顶
      const isUploader = comment.video.uploaderId === userId;
      const isAdmin = userRole === "ADMIN" || userRole === "OWNER";

      if (!isUploader && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "无权置顶评论",
        });
      }

      // 如果要置顶，先取消其他置顶
      if (isPinned) {
        await ctx.prisma.comment.updateMany({
          where: {
            videoId: comment.videoId,
            isPinned: true,
          },
          data: { isPinned: false },
        });
      }

      await ctx.prisma.comment.update({
        where: { id: commentId },
        data: { isPinned },
      });

      return { success: true };
    }),
});
