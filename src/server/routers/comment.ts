import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { videoId, content, parentId, replyToUserId } = input;
      const userId = ctx.session.user.id;

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
