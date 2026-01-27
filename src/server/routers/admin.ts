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
      totalViews,
      likeCount,
      favoriteCount,
    ] = await Promise.all([
      ctx.prisma.user.count(),
      ctx.prisma.video.count({ where: { status: "PUBLISHED" } }),
      ctx.prisma.tag.count(),
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
      const since = new Date();
      since.setDate(since.getDate() - input.days);
      since.setHours(0, 0, 0, 0);

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

      // 按日期分组
      const trend: Record<string, { users: number; videos: number }> = {};

      for (let i = 0; i < input.days; i++) {
        const date = new Date(since);
        date.setDate(date.getDate() + i);
        const key = date.toISOString().split("T")[0];
        trend[key] = { users: 0, videos: 0 };
      }

      users.forEach((u) => {
        const key = u.createdAt.toISOString().split("T")[0];
        if (trend[key]) trend[key].users++;
      });

      videos.forEach((v) => {
        const key = v.createdAt.toISOString().split("T")[0];
        if (trend[key]) trend[key].videos++;
      });

      return Object.entries(trend).map(([date, data]) => ({
        date,
        ...data,
      }));
    }),

  // ========== 用户管理（站长专用）==========

  // 获取用户列表（管理员可查看，站长可管理）
  listUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().nullish(),
        search: z.string().optional(),
        role: z.enum(["ALL", "USER", "ADMIN", "OWNER"]).default("ALL"),
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
          createdAt: true,
          _count: { select: { videos: true } },
        },
      });

      let nextCursor: string | undefined = undefined;
      if (users.length > input.limit) {
        const nextItem = users.pop();
        nextCursor = nextItem!.id;
      }

      return { users, nextCursor };
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

  // ========== 标签管理 ==========

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
});
