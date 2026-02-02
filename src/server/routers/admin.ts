import { z } from "zod";
import { router, protectedProcedure, adminProcedure, ownerProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { ADMIN_SCOPES, type AdminScope } from "@/lib/constants";
import { Prisma } from "@/generated/prisma/client";

// 检查用户是否有特定权限
async function hasScope(
  prisma: typeof import("@/lib/prisma").prisma,
  userId: string,
  scope: AdminScope
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, adminScopes: true },
  });

  if (!user) return false;

  // 站长拥有所有权限
  if (user.role === "OWNER") return true;

  // 普通用户无管理权限
  if (user.role === "USER") return false;

  // 管理员检查 adminScopes
  const scopes = (user.adminScopes as string[]) || [];
  return scopes.includes(scope);
}

export const adminRouter = router({
  // 获取当前用户的管理权限信息
  getMyPermissions: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { role: true, adminScopes: true },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    const isOwner = user.role === "OWNER";
    const isAdmin = user.role === "ADMIN" || isOwner;
    const scopes = isOwner
      ? Object.keys(ADMIN_SCOPES)
      : ((user.adminScopes as string[]) || []);

    return {
      role: user.role,
      isOwner,
      isAdmin,
      scopes,
      allScopes: ADMIN_SCOPES,
    };
  }),

  // 公开统计数据（所有登录用户可见）
  getPublicStats: protectedProcedure.query(async ({ ctx }) => {
    const [
      userCount,
      videoCount,
      tagCount,
      commentCount,
      totalViews,
      likeCount,
      favoriteCount,
    ] = await Promise.all([
      ctx.prisma.user.count(),
      ctx.prisma.video.count({ where: { status: "PUBLISHED" } }),
      ctx.prisma.tag.count(),
      ctx.prisma.comment.count({ where: { isDeleted: false } }),
      ctx.prisma.video.aggregate({
        where: { status: "PUBLISHED" },
        _sum: { views: true },
      }),
      ctx.prisma.like.count(),
      ctx.prisma.favorite.count(),
    ]);

    return {
      userCount,
      videoCount,
      tagCount,
      commentCount,
      totalViews: totalViews._sum.views || 0,
      likeCount,
      favoriteCount,
    };
  }),

  // 增量统计数据（最近30天）
  getGrowthStats: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - input.days);

      const [
        newUsers,
        newVideos,
        newTags,
        newLikes,
        newFavorites,
      ] = await Promise.all([
        ctx.prisma.user.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.video.count({
          where: { createdAt: { gte: since }, status: "PUBLISHED" },
        }),
        ctx.prisma.tag.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.like.count({ where: { createdAt: { gte: since } } }),
        ctx.prisma.favorite.count({ where: { createdAt: { gte: since } } }),
      ]);

      return {
        days: input.days,
        newUsers,
        newVideos,
        newTags,
        newLikes,
        newFavorites,
      };
    }),

  // 增长趋势数据（每日统计）
  getGrowthTrend: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      // 使用本地日期避免时区问题
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const since = new Date(today);
      since.setDate(since.getDate() - input.days + 1); // +1 确保包含今天

      // 获取每日用户注册数
      const users = await ctx.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      });

      // 获取每日视频发布数
      const videos = await ctx.prisma.video.findMany({
        where: { createdAt: { gte: since }, status: "PUBLISHED" },
        select: { createdAt: true },
      });

      // 按日期分组（使用本地日期格式）
      const trend: Record<string, { users: number; videos: number }> = {};

      for (let i = 0; i < input.days; i++) {
        const date = new Date(since);
        date.setDate(date.getDate() + i);
        // 使用本地日期格式 YYYY-MM-DD
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        trend[key] = { users: 0, videos: 0 };
      }

      users.forEach((u) => {
        const d = new Date(u.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (trend[key]) trend[key].users++;
      });

      videos.forEach((v) => {
        const d = new Date(v.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (trend[key]) trend[key].videos++;
      });

      return Object.entries(trend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
          date,
          ...data,
        }));
    }),

  // ========== 用户管理（站长专用）==========

  // 用户统计
  getUserStats: adminProcedure.query(async ({ ctx }) => {
    const canView = await hasScope(ctx.prisma, ctx.session.user.id, "user:view");
    if (!canView) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无用户查看权限" });
    }

    const [total, users, admins, owners, banned] = await Promise.all([
      ctx.prisma.user.count(),
      ctx.prisma.user.count({ where: { role: "USER" } }),
      ctx.prisma.user.count({ where: { role: "ADMIN" } }),
      ctx.prisma.user.count({ where: { role: "OWNER" } }),
      ctx.prisma.user.count({ where: { isBanned: true } }),
    ]);

    return { total, users, admins, owners, banned };
  }),

  // 获取用户列表（管理员可查看，站长可管理）
  listUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().nullish(),
        search: z.string().optional(),
        role: z.enum(["ALL", "USER", "ADMIN", "OWNER"]).default("ALL"),
        banned: z.enum(["ALL", "BANNED", "ACTIVE"]).default("ALL"),
      })
    )
    .query(async ({ ctx, input }) => {
      // 检查权限
      const canView = await hasScope(ctx.prisma, ctx.session.user.id, "user:view");
      if (!canView) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无用户查看权限" });
      }

      const users = await ctx.prisma.user.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: {
          ...(input.role !== "ALL" && { role: input.role }),
          ...(input.banned === "BANNED" && { isBanned: true }),
          ...(input.banned === "ACTIVE" && { isBanned: false }),
          ...(input.search && {
            OR: [
              { username: { contains: input.search, mode: "insensitive" } },
              { nickname: { contains: input.search, mode: "insensitive" } },
              { email: { contains: input.search, mode: "insensitive" } },
            ],
          }),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          adminScopes: true,
          isBanned: true,
          banReason: true,
          lastIpLocation: true,
          lastGpsLocation: true,
          createdAt: true,
          _count: { select: { videos: true, comments: true, likes: true } },
        },
      });

      let nextCursor: string | undefined = undefined;
      if (users.length > input.limit) {
        const nextItem = users.pop();
        nextCursor = nextItem!.id;
      }

      return { users, nextCursor };
    }),

  // 封禁用户
  banUser: adminProcedure
    .input(z.object({ userId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "user:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无用户管理权限" });
      }

      const target = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      if (target.role === "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "不能封禁站长" });
      }

      await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { isBanned: true, banReason: input.reason, bannedAt: new Date() },
      });

      return { success: true };
    }),

  // 解封用户
  unbanUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "user:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无用户管理权限" });
      }

      await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { isBanned: false, banReason: null, bannedAt: null },
      });

      return { success: true };
    }),

  // 批量封禁用户
  batchBanUsers: adminProcedure
    .input(z.object({ userIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "user:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无用户管理权限" });
      }

      const result = await ctx.prisma.user.updateMany({
        where: { id: { in: input.userIds }, role: { not: "OWNER" } },
        data: { isBanned: true, bannedAt: new Date() },
      });

      return { success: true, count: result.count };
    }),

  // 批量解封用户
  batchUnbanUsers: adminProcedure
    .input(z.object({ userIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "user:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无用户管理权限" });
      }

      const result = await ctx.prisma.user.updateMany({
        where: { id: { in: input.userIds } },
        data: { isBanned: false, banReason: null, bannedAt: null },
      });

      return { success: true, count: result.count };
    }),

  // 更新用户角色（站长专用）
  updateUserRole: ownerProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["USER", "ADMIN"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能修改自己的角色" });
      }

      const targetUser = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      if (targetUser.role === "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "不能修改站长的角色" });
      }

      const user = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: {
          role: input.role,
          // 降级为普通用户时清空权限
          ...(input.role === "USER" && { adminScopes: Prisma.DbNull }),
        },
        select: { id: true, username: true, role: true, adminScopes: true },
      });

      return { success: true, user };
    }),

  // 更新管理员权限范围（站长专用）
  updateAdminScopes: ownerProcedure
    .input(
      z.object({
        userId: z.string(),
        scopes: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const targetUser = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      });

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      if (targetUser.role !== "ADMIN") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "只能为管理员分配权限" });
      }

      // 验证权限范围有效性
      const validScopes = input.scopes.filter((s) => s in ADMIN_SCOPES);

      const user = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { adminScopes: validScopes },
        select: { id: true, username: true, role: true, adminScopes: true },
      });

      return { success: true, user };
    }),

  // ========== 视频管理 ==========

  // 视频统计
  getVideoStats: adminProcedure.query(async ({ ctx }) => {
    const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
    if (!canModerate) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
    }

    const [total, published, pending, rejected] = await Promise.all([
      ctx.prisma.video.count(),
      ctx.prisma.video.count({ where: { status: "PUBLISHED" } }),
      ctx.prisma.video.count({ where: { status: "PENDING" } }),
      ctx.prisma.video.count({ where: { status: "REJECTED" } }),
    ]);

    return { total, published, pending, rejected };
  }),

  // 获取所有视频列表（包括待审核）
  listAllVideos: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().nullish(),
        status: z.enum(["ALL", "PENDING", "PUBLISHED", "REJECTED"]).default("ALL"),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
      }

      const videos = await ctx.prisma.video.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: {
          ...(input.status !== "ALL" && { status: input.status }),
          ...(input.search && {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { description: { contains: input.search, mode: "insensitive" } },
            ],
          }),
        },
        orderBy: { createdAt: "desc" },
        include: {
          uploader: {
            select: { id: true, username: true, nickname: true, avatar: true },
          },
          tags: { include: { tag: true } },
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

  // 审核视频
  moderateVideo: adminProcedure
    .input(
      z.object({
        videoId: z.string(),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频审核权限" });
      }

      const video = await ctx.prisma.video.update({
        where: { id: input.videoId },
        data: { status: input.status },
        select: { id: true, title: true, status: true },
      });

      return { success: true, video };
    }),

  // 删除视频（管理员）
  deleteVideo: adminProcedure
    .input(z.object({ videoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
      }

      await ctx.prisma.video.delete({ where: { id: input.videoId } });

      return { success: true };
    }),

  // 批量审核视频
  batchModerateVideos: adminProcedure
    .input(
      z.object({
        videoIds: z.array(z.string()).min(1).max(100),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canModerate = await hasScope(ctx.prisma, ctx.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频审核权限" });
      }

      const result = await ctx.prisma.video.updateMany({
        where: { id: { in: input.videoIds } },
        data: { status: input.status },
      });

      return { success: true, count: result.count };
    }),

  // 批量删除视频
  batchDeleteVideos: adminProcedure
    .input(z.object({ videoIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "video:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无视频管理权限" });
      }

      const result = await ctx.prisma.video.deleteMany({
        where: { id: { in: input.videoIds } },
      });

      return { success: true, count: result.count };
    }),

  // ========== 标签管理 ==========

  // 标签统计
  getTagStats: adminProcedure.query(async ({ ctx }) => {
    const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
    if (!canManage) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });
    }

    const tags = await ctx.prisma.tag.findMany({
      select: { _count: { select: { videos: true } } },
    });

    const total = tags.length;
    const withVideos = tags.filter((t) => t._count.videos > 0).length;
    const empty = total - withVideos;

    return { total, withVideos, empty };
  }),

  // 创建标签
  createTag: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        slug: z.string().min(1).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });
      }

      // 生成 slug
      const slug = input.slug || input.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-\u4e00-\u9fa5]/g, "");

      // 检查是否已存在
      const existing = await ctx.prisma.tag.findFirst({
        where: { OR: [{ name: input.name }, { slug }] },
      });

      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "标签名称或 slug 已存在" });
      }

      const tag = await ctx.prisma.tag.create({
        data: { name: input.name, slug },
      });

      return { success: true, tag };
    }),

  // 获取所有标签
  listTags: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().nullish(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });
      }

      const tags = await ctx.prisma.tag.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: "insensitive" } },
                { slug: { contains: input.search, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { videos: true } },
        },
      });

      let nextCursor: string | undefined = undefined;
      if (tags.length > input.limit) {
        const nextItem = tags.pop();
        nextCursor = nextItem!.id;
      }

      return { tags, nextCursor };
    }),

  // 更新标签
  updateTag: adminProcedure
    .input(
      z.object({
        tagId: z.string(),
        name: z.string().min(1).max(50).optional(),
        slug: z.string().min(1).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });
      }

      const { tagId, ...data } = input;

      const tag = await ctx.prisma.tag.update({
        where: { id: tagId },
        data,
      });

      return { success: true, tag };
    }),

  // 删除标签
  deleteTag: adminProcedure
    .input(z.object({ tagId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });
      }

      await ctx.prisma.tag.delete({ where: { id: input.tagId } });

      return { success: true };
    }),

  // 批量删除标签
  batchDeleteTags: adminProcedure
    .input(z.object({ tagIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });
      }

      const result = await ctx.prisma.tag.deleteMany({
        where: { id: { in: input.tagIds } },
      });

      return { success: true, count: result.count };
    }),

  // 合并标签
  mergeTags: adminProcedure
    .input(
      z.object({
        sourceTagIds: z.array(z.string()).min(1).max(100),
        targetTagId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "tag:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无标签管理权限" });
      }

      // 获取目标标签
      const targetTag = await ctx.prisma.tag.findUnique({
        where: { id: input.targetTagId },
      });

      if (!targetTag) {
        throw new TRPCError({ code: "NOT_FOUND", message: "目标标签不存在" });
      }

      // 获取所有源标签关联的视频
      const sourceVideos = await ctx.prisma.video.findMany({
        where: {
          tags: { some: { tagId: { in: input.sourceTagIds } } },
        },
        select: { id: true },
      });

      // 将这些视频关联到目标标签
      for (const video of sourceVideos) {
        // 添加目标标签关联
        await ctx.prisma.tagOnVideo.upsert({
          where: { videoId_tagId: { videoId: video.id, tagId: input.targetTagId } },
          create: { videoId: video.id, tagId: input.targetTagId },
          update: {},
        });
        
        // 删除源标签关联
        await ctx.prisma.tagOnVideo.deleteMany({
          where: { videoId: video.id, tagId: { in: input.sourceTagIds } },
        });
      }

      // 删除源标签
      await ctx.prisma.tag.deleteMany({
        where: { id: { in: input.sourceTagIds } },
      });

      return { success: true, mergedCount: input.sourceTagIds.length };
    }),

  // ========== 评论管理 ==========

  // 获取评论列表
  listComments: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().nullish(),
        search: z.string().optional(),
        status: z.enum(["ALL", "VISIBLE", "HIDDEN", "DELETED"]).default("ALL"),
      })
    )
    .query(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      const where = {
        ...(input.search && {
          OR: [
            { content: { contains: input.search, mode: "insensitive" as const } },
            { user: { username: { contains: input.search, mode: "insensitive" as const } } },
            { user: { nickname: { contains: input.search, mode: "insensitive" as const } } },
            { video: { title: { contains: input.search, mode: "insensitive" as const } } },
          ],
        }),
        ...(input.status === "VISIBLE" && { isDeleted: false, isHidden: false }),
        ...(input.status === "HIDDEN" && { isHidden: true, isDeleted: false }),
        ...(input.status === "DELETED" && { isDeleted: true }),
      };

      type AdminComment = Prisma.CommentGetPayload<{
        include: {
          user: { select: { id: true; username: true; nickname: true; avatar: true } };
          video: { select: { id: true; title: true } };
        };
      }>;

      const comments = (await ctx.prisma.comment.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, username: true, nickname: true, avatar: true } },
          video: { select: { id: true, title: true } },
        },
      })) as AdminComment[];

      let nextCursor: string | undefined = undefined;
      if (comments.length > input.limit) {
        const nextItem = comments.pop();
        nextCursor = nextItem!.id;
      }

      return { comments, nextCursor };
    }),

  // 隐藏/显示评论
  toggleCommentHidden: adminProcedure
    .input(z.object({ commentId: z.string(), isHidden: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      await ctx.prisma.comment.update({
        where: { id: input.commentId },
        data: { isHidden: input.isHidden },
      });

      return { success: true };
    }),

  // 删除评论（软删除）
  deleteComment: adminProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      await ctx.prisma.comment.update({
        where: { id: input.commentId },
        data: { isDeleted: true },
      });

      return { success: true };
    }),

  // 恢复评论
  restoreComment: adminProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      await ctx.prisma.comment.update({
        where: { id: input.commentId },
        data: { isDeleted: false },
      });

      return { success: true };
    }),

  // 评论统计
  getCommentStats: adminProcedure.query(async ({ ctx }) => {
    const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
    if (!canManage) {
      throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
    }

    const [total, visible, hidden, deleted] = await Promise.all([
      ctx.prisma.comment.count(),
      ctx.prisma.comment.count({ where: { isDeleted: false, isHidden: false } }),
      ctx.prisma.comment.count({ where: { isHidden: true, isDeleted: false } }),
      ctx.prisma.comment.count({ where: { isDeleted: true } }),
    ]);

    return { total, visible, hidden, deleted };
  }),

  // 批量评论操作
  batchCommentAction: adminProcedure
    .input(
      z.object({
        commentIds: z.array(z.string()).min(1).max(100),
        action: z.enum(["hide", "show", "delete", "restore"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      const data = (() => {
        switch (input.action) {
          case "hide":
            return { isHidden: true };
          case "show":
            return { isHidden: false };
          case "delete":
            return { isDeleted: true };
          case "restore":
            return { isDeleted: false };
        }
      })();

      const result = await ctx.prisma.comment.updateMany({
        where: { id: { in: input.commentIds } },
        data,
      });

      return { success: true, count: result.count };
    }),

  // 硬删除评论（彻底删除）
  hardDeleteComment: adminProcedure
    .input(z.object({ commentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      // 先删除所有子评论（回复）
      await ctx.prisma.comment.deleteMany({
        where: { parentId: input.commentId },
      });

      // 删除评论的所有反应
      await ctx.prisma.commentReaction.deleteMany({
        where: { commentId: input.commentId },
      });

      // 删除评论本身
      await ctx.prisma.comment.delete({
        where: { id: input.commentId },
      });

      return { success: true };
    }),

  // 批量硬删除评论
  batchHardDeleteComments: adminProcedure
    .input(z.object({ commentIds: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const canManage = await hasScope(ctx.prisma, ctx.session.user.id, "comment:manage");
      if (!canManage) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无评论管理权限" });
      }

      // 先删除所有子评论
      await ctx.prisma.comment.deleteMany({
        where: { parentId: { in: input.commentIds } },
      });

      // 删除评论的所有反应
      await ctx.prisma.commentReaction.deleteMany({
        where: { commentId: { in: input.commentIds } },
      });

      // 删除评论
      const result = await ctx.prisma.comment.deleteMany({
        where: { id: { in: input.commentIds } },
      });

      return { success: true, count: result.count };
    }),
});
