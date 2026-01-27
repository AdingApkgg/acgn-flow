import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { getCache, setCache, deleteCachePattern } from "@/lib/redis";

const VIDEO_CACHE_TTL = 300; // 5 minutes

export const videoRouter = router({
  // 获取视频列表
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
        categoryId: z.string().optional(),
        tagId: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.enum(["latest", "views", "likes"]).default("latest"),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, categoryId, tagId, search, sortBy } = input;

      const orderBy = {
        latest: { createdAt: "desc" as const },
        views: { views: "desc" as const },
        likes: { createdAt: "desc" as const }, // 简化处理
      }[sortBy];

      const videos = await ctx.prisma.video.findMany({
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        where: {
          status: "PUBLISHED",
          ...(categoryId && { categoryId }),
          ...(tagId && {
            tags: { some: { tagId } },
          }),
          ...(search && {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }),
        },
        orderBy,
        include: {
          uploader: {
            select: { id: true, username: true, nickname: true, avatar: true },
          },
          category: { select: { id: true, name: true, slug: true } },
          _count: { select: { likes: true, favorites: true } },
        },
      });

      let nextCursor: string | undefined;
      if (videos.length > limit) {
        const nextItem = videos.pop();
        nextCursor = nextItem?.id;
      }

      return { videos, nextCursor };
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
          category: { select: { id: true, name: true, slug: true } },
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
      const whereClause: { uploaderId: string; status?: string } = {
        uploaderId: ctx.session.user.id,
      };

      if (input.status !== "ALL") {
        whereClause.status = input.status;
      }

      const videos = await ctx.prisma.video.findMany({
        where: whereClause,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          tags: {
            include: { tag: { select: { id: true, name: true, slug: true } } },
          },
          _count: { select: { likes: true, favorites: true } },
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
          category: { select: { id: true, name: true, slug: true } },
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

  // 创建视频
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(100),
        description: z.string().max(5000).optional(),
        coverUrl: z.string().url().optional().or(z.literal("")),
        videoUrl: z.string().url(),
        duration: z.number().optional(),
        categoryId: z.string().optional(),
        categoryName: z.string().optional(), // 新建分类名称
        tagIds: z.array(z.string()).optional(),
        tagNames: z.array(z.string()).optional(), // 新建标签名称
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tagIds, tagNames, categoryName, categoryId, coverUrl, ...data } = input;

      // 如果提供了新分类名称，创建新分类
      let finalCategoryId = categoryId;
      if (categoryName && !categoryId) {
        const slug = categoryName
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "");
        
        const existingCategory = await ctx.prisma.category.findFirst({
          where: { OR: [{ name: categoryName }, { slug }] },
        });
        
        if (existingCategory) {
          finalCategoryId = existingCategory.id;
        } else {
          const newCategory = await ctx.prisma.category.create({
            data: { name: categoryName, slug: slug || `cat-${Date.now()}` },
          });
          finalCategoryId = newCategory.id;
        }
      }

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

      const video = await ctx.prisma.video.create({
        data: {
          title: data.title,
          description: data.description,
          videoUrl: data.videoUrl,
          duration: data.duration,
          status: "PUBLISHED", // 直接发布，无需审核
          ...(coverUrl ? { coverUrl } : {}),
          ...(finalCategoryId ? { category: { connect: { id: finalCategoryId } } } : {}),
          uploader: { connect: { id: ctx.session.user.id } },
          ...(allTagIds.length > 0 
            ? { tags: { create: allTagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })) } }
            : {}),
        },
      });

      return video;
    }),

  // 更新视频
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(100).optional(),
        description: z.string().max(5000).optional(),
        coverUrl: z.string().url().optional(),
        videoUrl: z.string().url().optional(),
        categoryId: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

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

      const updated = await ctx.prisma.video.update({
        where: { id },
        data,
      });

      await deleteCachePattern(`video:${id}`);
      return updated;
    }),

  // 删除视频
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const video = await ctx.prisma.video.findUnique({
        where: { id: input.id },
        select: { uploaderId: true },
      });

      if (!video) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (video.uploaderId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.prisma.video.update({
        where: { id: input.id },
        data: { status: "DELETED" },
      });

      await deleteCachePattern(`video:${input.id}`);
      return { success: true };
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
              category: { select: { id: true, name: true, slug: true } },
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
              category: { select: { id: true, name: true, slug: true } },
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
});
