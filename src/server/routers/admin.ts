import { ORPCError } from "@orpc/server";
import { and, desc, eq, exists, gte, ilike, inArray, ne, or, sql, sum } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/db/schema";
import { ADMIN_SCOPES } from "@/lib/constants";
import { adminProcedure, ownerProcedure, protectedProcedure } from "../orpc";
import { hasAdminScope as hasScope } from "../services/permissions";
import { cursorCondition, escapeLike, requiredRow } from "../services/query";

export const adminRouter = {
  // 获取当前用户的管理权限信息
  getMyPermissions: protectedProcedure.handler(async ({ context }) => {
    const user = await context.db.query.user
      .findFirst({
        columns: { role: true, adminScopes: true },
        where: and(eq(schema.user.id, context.session.user.id)),
      })
      .then((row) => row ?? null);

    if (!user) {
      throw new ORPCError("NOT_FOUND");
    }

    const isOwner = user.role === "OWNER";
    const isAdmin = user.role === "ADMIN" || isOwner;
    const scopes = isOwner ? Object.keys(ADMIN_SCOPES) : (user.adminScopes as string[]) || [];

    return {
      role: user.role,
      isOwner,
      isAdmin,
      scopes,
      allScopes: ADMIN_SCOPES,
    };
  }),

  // 公开统计数据（所有登录用户可见）
  getPublicStats: protectedProcedure.handler(async ({ context }) => {
    const [userCount, videoCount, tagCount, commentCount, totalViews, likeCount, favoriteCount] =
      await Promise.all([
        context.db.$count(schema.user, undefined),
        context.db.$count(schema.video, and(eq(schema.video.status, "PUBLISHED"))),
        context.db.$count(schema.tag, undefined),
        context.db.$count(schema.comment, and(eq(schema.comment.isDeleted, false))),
        context.db
          .select({ views: sum(schema.video.views).mapWith(Number) })
          .from(schema.video)
          .where(and(eq(schema.video.status, "PUBLISHED")))
          .then((rows) => ({ _sum: rows[0] })),
        context.db.$count(schema.like, undefined),
        context.db.$count(schema.favorite, undefined),
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
    .handler(async ({ context, input }) => {
      const since = new Date();
      since.setDate(since.getDate() - input.days);

      const [newUsers, newVideos, newTags, newLikes, newFavorites] = await Promise.all([
        context.db.$count(schema.user, and(gte(schema.user.createdAt, since))),
        context.db.$count(
          schema.video,
          and(gte(schema.video.createdAt, since), eq(schema.video.status, "PUBLISHED")),
        ),
        context.db.$count(schema.tag, and(gte(schema.tag.createdAt, since))),
        context.db.$count(schema.like, and(gte(schema.like.createdAt, since))),
        context.db.$count(schema.favorite, and(gte(schema.favorite.createdAt, since))),
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
    .handler(async ({ context, input }) => {
      // 使用本地日期避免时区问题
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const since = new Date(today);
      since.setDate(since.getDate() - input.days + 1); // +1 确保包含今天

      // 获取每日用户注册数
      const users = await context.db.query.user.findMany({
        columns: { createdAt: true },
        where: and(gte(schema.user.createdAt, since)),
      });

      // 获取每日视频发布数
      const videos = await context.db.query.video.findMany({
        columns: { createdAt: true },
        where: and(gte(schema.video.createdAt, since), eq(schema.video.status, "PUBLISHED")),
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
  getUserStats: adminProcedure.handler(async ({ context }) => {
    const canView = await hasScope(context.db, context.session.user.id, "user:view");
    if (!canView) {
      throw new ORPCError("FORBIDDEN", { message: "无用户查看权限" });
    }

    const [total, users, admins, owners, banned] = await Promise.all([
      context.db.$count(schema.user, undefined),
      context.db.$count(schema.user, and(eq(schema.user.role, "USER"))),
      context.db.$count(schema.user, and(eq(schema.user.role, "ADMIN"))),
      context.db.$count(schema.user, and(eq(schema.user.role, "OWNER"))),
      context.db.$count(schema.user, and(eq(schema.user.isBanned, true))),
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
      }),
    )
    .handler(async ({ context, input }) => {
      // 检查权限
      const canView = await hasScope(context.db, context.session.user.id, "user:view");
      if (!canView) {
        throw new ORPCError("FORBIDDEN", { message: "无用户查看权限" });
      }

      const users = await context.db.query.user.findMany({
        columns: {
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
        },
        extras: (row) => ({
          _count: sql<{
            videos: number;
            comments: number;
            likes: number;
          }>`json_build_object('videos', (select count(*)::int from "Video" as "count_videos" where "count_videos"."uploaderId" = ${sql`${row.id}`}), 'comments', (select count(*)::int from "Comment" as "count_comments" where "count_comments"."userId" = ${sql`${row.id}`}), 'likes', (select count(*)::int from "Like" as "count_likes" where "count_likes"."userId" = ${sql`${row.id}`}))`.as(
            "_count",
          ),
        }),
        where: and(
          and(
            input.role !== "ALL" ? and(eq(schema.user.role, input.role)) : undefined,
            input.banned === "BANNED" ? and(eq(schema.user.isBanned, true)) : undefined,
            input.banned === "ACTIVE" ? and(eq(schema.user.isBanned, false)) : undefined,
            input.search
              ? and(
                  or(
                    and(ilike(schema.user.username, `%${escapeLike(input.search)}%`)),
                    and(ilike(schema.user.nickname, `%${escapeLike(input.search)}%`)),
                    and(ilike(schema.user.email, `%${escapeLike(input.search)}%`)),
                  ),
                )
              : undefined,
          ),
          cursorCondition(schema.user, (input.cursor ? { id: input.cursor } : undefined)?.id, [
            { column: schema.user.createdAt, direction: "desc" },
          ]),
        ),
        orderBy: [desc(schema.user.createdAt), desc(schema.user.id)],
        limit: input.limit + 1,
      });

      let nextCursor: string | undefined;
      if (users.length > input.limit) {
        const nextItem = users.pop();
        nextCursor = nextItem?.id;
      }

      return { users, nextCursor };
    }),

  // 封禁用户
  banUser: adminProcedure
    .input(z.object({ userId: z.string(), reason: z.string().optional() }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "user:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无用户管理权限" });
      }

      const target = await context.db.query.user
        .findFirst({ columns: { role: true }, where: and(eq(schema.user.id, input.userId)) })
        .then((row) => row ?? null);

      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "用户不存在" });
      }

      if (target.role === "OWNER") {
        throw new ORPCError("FORBIDDEN", { message: "不能封禁站长" });
      }

      await context.db
        .update(schema.user)
        .set({ isBanned: true, banReason: input.reason, bannedAt: new Date() })
        .where(and(eq(schema.user.id, input.userId)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),

  // 解封用户
  unbanUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "user:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无用户管理权限" });
      }

      await context.db
        .update(schema.user)
        .set({ isBanned: false, banReason: null, bannedAt: null })
        .where(and(eq(schema.user.id, input.userId)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),

  // 批量封禁用户
  batchBanUsers: adminProcedure
    .input(z.object({ userIds: z.array(z.string()).min(1).max(100) }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "user:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无用户管理权限" });
      }

      const result = await context.db
        .update(schema.user)
        .set({ isBanned: true, bannedAt: new Date() })
        .where(and(inArray(schema.user.id, input.userIds), ne(schema.user.role, "OWNER")))
        .returning()
        .then((rows) => ({ count: rows.length }));

      return { success: true, count: result.count };
    }),

  // 批量解封用户
  batchUnbanUsers: adminProcedure
    .input(z.object({ userIds: z.array(z.string()).min(1).max(100) }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "user:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无用户管理权限" });
      }

      const result = await context.db
        .update(schema.user)
        .set({ isBanned: false, banReason: null, bannedAt: null })
        .where(and(inArray(schema.user.id, input.userIds)))
        .returning()
        .then((rows) => ({ count: rows.length }));

      return { success: true, count: result.count };
    }),

  // 更新用户角色（站长专用）
  updateUserRole: ownerProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["USER", "ADMIN"]),
      }),
    )
    .handler(async ({ context, input }) => {
      if (input.userId === context.session.user.id) {
        throw new ORPCError("BAD_REQUEST", { message: "不能修改自己的角色" });
      }

      const targetUser = await context.db.query.user
        .findFirst({ columns: { role: true }, where: and(eq(schema.user.id, input.userId)) })
        .then((row) => row ?? null);

      if (!targetUser) {
        throw new ORPCError("NOT_FOUND", { message: "用户不存在" });
      }

      if (targetUser.role === "OWNER") {
        throw new ORPCError("FORBIDDEN", { message: "不能修改站长的角色" });
      }

      const user = await context.db
        .update(schema.user)
        .set({ role: input.role, ...(input.role === "USER" ? { adminScopes: null } : undefined) })
        .where(and(eq(schema.user.id, input.userId)))
        .returning({
          id: schema.user.id,
          username: schema.user.username,
          role: schema.user.role,
          adminScopes: schema.user.adminScopes,
        })
        .then((rows) => requiredRow(rows));

      return { success: true, user };
    }),

  // 更新管理员权限范围（站长专用）
  updateAdminScopes: ownerProcedure
    .input(
      z.object({
        userId: z.string(),
        scopes: z.array(z.string()),
      }),
    )
    .handler(async ({ context, input }) => {
      const targetUser = await context.db.query.user
        .findFirst({ columns: { role: true }, where: and(eq(schema.user.id, input.userId)) })
        .then((row) => row ?? null);

      if (!targetUser) {
        throw new ORPCError("NOT_FOUND", { message: "用户不存在" });
      }

      if (targetUser.role !== "ADMIN") {
        throw new ORPCError("BAD_REQUEST", { message: "只能为管理员分配权限" });
      }

      // 验证权限范围有效性
      const validScopes = input.scopes.filter((s) => s in ADMIN_SCOPES);

      const user = await context.db
        .update(schema.user)
        .set({ adminScopes: validScopes })
        .where(and(eq(schema.user.id, input.userId)))
        .returning({
          id: schema.user.id,
          username: schema.user.username,
          role: schema.user.role,
          adminScopes: schema.user.adminScopes,
        })
        .then((rows) => requiredRow(rows));

      return { success: true, user };
    }),

  // ========== 视频管理 ==========

  // 视频统计
  getVideoStats: adminProcedure.handler(async ({ context }) => {
    const canModerate = await hasScope(context.db, context.session.user.id, "video:moderate");
    if (!canModerate) {
      throw new ORPCError("FORBIDDEN", { message: "无视频管理权限" });
    }

    const [total, published, pending, rejected] = await Promise.all([
      context.db.$count(schema.video, undefined),
      context.db.$count(schema.video, and(eq(schema.video.status, "PUBLISHED"))),
      context.db.$count(schema.video, and(eq(schema.video.status, "PENDING"))),
      context.db.$count(schema.video, and(eq(schema.video.status, "REJECTED"))),
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
      }),
    )
    .handler(async ({ context, input }) => {
      const canModerate = await hasScope(context.db, context.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new ORPCError("FORBIDDEN", { message: "无视频管理权限" });
      }

      const videos = await context.db.query.video.findMany({
        with: {
          uploader: { columns: { id: true, username: true, nickname: true, avatar: true } },
          tags: { with: { tag: true } },
        },
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
            input.status !== "ALL" ? and(eq(schema.video.status, input.status)) : undefined,
            input.search
              ? and(
                  or(
                    and(ilike(schema.video.title, `%${escapeLike(input.search)}%`)),
                    and(ilike(schema.video.description, `%${escapeLike(input.search)}%`)),
                  ),
                )
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

  // 审核视频
  moderateVideo: adminProcedure
    .input(
      z.object({
        videoId: z.string(),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      }),
    )
    .handler(async ({ context, input }) => {
      const canModerate = await hasScope(context.db, context.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new ORPCError("FORBIDDEN", { message: "无视频审核权限" });
      }

      const video = await context.db
        .update(schema.video)
        .set({ status: input.status })
        .where(and(eq(schema.video.id, input.videoId)))
        .returning({ id: schema.video.id, title: schema.video.title, status: schema.video.status })
        .then((rows) => requiredRow(rows));

      return { success: true, video };
    }),

  // 删除视频（管理员）
  deleteVideo: adminProcedure
    .input(z.object({ videoId: z.string() }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "video:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无视频管理权限" });
      }

      await context.db
        .delete(schema.video)
        .where(and(eq(schema.video.id, input.videoId)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),

  // 批量审核视频
  batchModerateVideos: adminProcedure
    .input(
      z.object({
        videoIds: z.array(z.string()).min(1).max(100),
        status: z.enum(["PUBLISHED", "REJECTED"]),
      }),
    )
    .handler(async ({ context, input }) => {
      const canModerate = await hasScope(context.db, context.session.user.id, "video:moderate");
      if (!canModerate) {
        throw new ORPCError("FORBIDDEN", { message: "无视频审核权限" });
      }

      const result = await context.db
        .update(schema.video)
        .set({ status: input.status })
        .where(and(inArray(schema.video.id, input.videoIds)))
        .returning()
        .then((rows) => ({ count: rows.length }));

      return { success: true, count: result.count };
    }),

  // 批量删除视频
  batchDeleteVideos: adminProcedure
    .input(z.object({ videoIds: z.array(z.string()).min(1).max(100) }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "video:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无视频管理权限" });
      }

      const result = await context.db
        .delete(schema.video)
        .where(and(inArray(schema.video.id, input.videoIds)))
        .returning()
        .then((rows) => ({ count: rows.length }));

      return { success: true, count: result.count };
    }),

  // ========== 标签管理 ==========

  // 标签统计
  getTagStats: adminProcedure.handler(async ({ context }) => {
    const canManage = await hasScope(context.db, context.session.user.id, "tag:manage");
    if (!canManage) {
      throw new ORPCError("FORBIDDEN", { message: "无标签管理权限" });
    }

    const tags = await context.db.query.tag.findMany({
      columns: {},
      extras: (row) => ({
        _count: sql<{
          videos: number;
        }>`json_build_object('videos', (select count(*)::int from "TagOnVideo" as "count_videos" where "count_videos"."tagId" = ${sql`${row.id}`}))`.as(
          "_count",
        ),
      }),
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
      }),
    )
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "tag:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无标签管理权限" });
      }

      // 生成 slug
      const slug =
        input.slug ||
        input.name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-\u4e00-\u9fa5]/g, "");

      // 检查是否已存在
      const existing = await context.db.query.tag
        .findFirst({
          where: and(or(and(eq(schema.tag.name, input.name)), and(eq(schema.tag.slug, slug)))),
        })
        .then((row) => row ?? null);

      if (existing) {
        throw new ORPCError("CONFLICT", { message: "标签名称或 slug 已存在" });
      }

      const tag = await context.db
        .insert(schema.tag)
        .values({ name: input.name, slug: slug })
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true, tag };
    }),

  // 获取所有标签
  listTags: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().nullish(),
        search: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "tag:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无标签管理权限" });
      }

      const tags = await context.db.query.tag.findMany({
        extras: (row) => ({
          _count: sql<{
            videos: number;
          }>`json_build_object('videos', (select count(*)::int from "TagOnVideo" as "count_videos" where "count_videos"."tagId" = ${sql`${row.id}`}))`.as(
            "_count",
          ),
        }),
        where: and(
          input.search
            ? and(
                or(
                  and(ilike(schema.tag.name, `%${escapeLike(input.search)}%`)),
                  and(ilike(schema.tag.slug, `%${escapeLike(input.search)}%`)),
                ),
              )
            : undefined,
          cursorCondition(schema.tag, (input.cursor ? { id: input.cursor } : undefined)?.id, [
            { column: schema.tag.createdAt, direction: "desc" },
          ]),
        ),
        orderBy: [desc(schema.tag.createdAt), desc(schema.tag.id)],
        limit: input.limit + 1,
      });

      let nextCursor: string | undefined;
      if (tags.length > input.limit) {
        const nextItem = tags.pop();
        nextCursor = nextItem?.id;
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
      }),
    )
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "tag:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无标签管理权限" });
      }

      const { tagId, ...data } = input;

      const tag = await context.db
        .update(schema.tag)
        .set(data)
        .where(and(eq(schema.tag.id, tagId)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true, tag };
    }),

  // 删除标签
  deleteTag: adminProcedure
    .input(z.object({ tagId: z.string() }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "tag:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无标签管理权限" });
      }

      await context.db
        .delete(schema.tag)
        .where(and(eq(schema.tag.id, input.tagId)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),

  // 批量删除标签
  batchDeleteTags: adminProcedure
    .input(z.object({ tagIds: z.array(z.string()).min(1).max(100) }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "tag:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无标签管理权限" });
      }

      const result = await context.db
        .delete(schema.tag)
        .where(and(inArray(schema.tag.id, input.tagIds)))
        .returning()
        .then((rows) => ({ count: rows.length }));

      return { success: true, count: result.count };
    }),

  // 合并标签
  mergeTags: adminProcedure
    .input(
      z.object({
        sourceTagIds: z.array(z.string()).min(1).max(100),
        targetTagId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "tag:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无标签管理权限" });
      }

      if (input.sourceTagIds.includes(input.targetTagId))
        throw new ORPCError("BAD_REQUEST", { message: "源标签不能包含目标标签" });
      return context.db.transaction(async (tx) => {
        // 获取目标标签
        const targetTag = await tx.query.tag
          .findFirst({ where: and(eq(schema.tag.id, input.targetTagId)) })
          .then((row) => row ?? null);

        if (!targetTag) {
          throw new ORPCError("NOT_FOUND", { message: "目标标签不存在" });
        }

        // 获取所有源标签关联的视频
        const sourceVideos = await tx.query.video.findMany({
          columns: { id: true },
          where: and(
            exists(
              sql`(select 1 from "TagOnVideo" as "rel_1" where ${and(eq(sql`"rel_1"."videoId"`, schema.video.id), and(inArray(sql`"rel_1"."tagId"`, input.sourceTagIds)))})`,
            ),
          ),
        });

        // 将这些视频关联到目标标签
        for (const video of sourceVideos) {
          // 添加目标标签关联
          await tx
            .insert(schema.tagOnVideo)
            .values({ videoId: video.id, tagId: input.targetTagId })
            .onConflictDoUpdate({
              target: [schema.tagOnVideo.videoId, schema.tagOnVideo.tagId],
              set: { videoId: schema.tagOnVideo.videoId },
            })
            .returning()
            .then((rows) => requiredRow(rows));

          // 删除源标签关联
          await tx
            .delete(schema.tagOnVideo)
            .where(
              and(
                eq(schema.tagOnVideo.videoId, video.id),
                inArray(schema.tagOnVideo.tagId, input.sourceTagIds),
              ),
            )
            .returning()
            .then((rows) => ({ count: rows.length }));
        }

        // 删除源标签
        await tx
          .delete(schema.tag)
          .where(and(inArray(schema.tag.id, input.sourceTagIds)))
          .returning()
          .then((rows) => ({ count: rows.length }));

        return { success: true, mergedCount: input.sourceTagIds.length };
      });
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
      }),
    )
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "comment:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无评论管理权限" });
      }

      const where = and(
        input.search
          ? or(
              ilike(schema.comment.content, `%${escapeLike(input.search)}%`),
              exists(
                sql`(select 1 from "User" as "comment_author" where "comment_author"."id" = ${schema.comment.userId} and ("comment_author"."username" ilike ${`%${escapeLike(input.search)}%`} or "comment_author"."nickname" ilike ${`%${escapeLike(input.search)}%`}))`,
              ),
              exists(
                sql`(select 1 from "Video" as "comment_video" where "comment_video"."id" = ${schema.comment.videoId} and "comment_video"."title" ilike ${`%${escapeLike(input.search)}%`})`,
              ),
            )
          : undefined,
        input.status === "VISIBLE"
          ? and(eq(schema.comment.isDeleted, false), eq(schema.comment.isHidden, false))
          : undefined,
        input.status === "HIDDEN"
          ? and(eq(schema.comment.isHidden, true), eq(schema.comment.isDeleted, false))
          : undefined,
        input.status === "DELETED" ? eq(schema.comment.isDeleted, true) : undefined,
      );

      const comments = await context.db.query.comment.findMany({
        with: {
          user: { columns: { id: true, username: true, nickname: true, avatar: true } },
          video: { columns: { id: true, title: true } },
        },
        where: and(
          where,
          cursorCondition(schema.comment, (input.cursor ? { id: input.cursor } : undefined)?.id, [
            { column: schema.comment.createdAt, direction: "desc" },
          ]),
        ),
        orderBy: [desc(schema.comment.createdAt), desc(schema.comment.id)],
        limit: input.limit + 1,
      });

      let nextCursor: string | undefined;
      if (comments.length > input.limit) {
        const nextItem = comments.pop();
        nextCursor = nextItem?.id;
      }

      return { comments, nextCursor };
    }),

  // 隐藏/显示评论
  toggleCommentHidden: adminProcedure
    .input(z.object({ commentId: z.string(), isHidden: z.boolean() }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "comment:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无评论管理权限" });
      }

      await context.db
        .update(schema.comment)
        .set({ isHidden: input.isHidden })
        .where(and(eq(schema.comment.id, input.commentId)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),

  // 删除评论（软删除）
  deleteComment: adminProcedure
    .input(z.object({ commentId: z.string() }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "comment:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无评论管理权限" });
      }

      await context.db
        .update(schema.comment)
        .set({ isDeleted: true })
        .where(and(eq(schema.comment.id, input.commentId)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),

  // 恢复评论
  restoreComment: adminProcedure
    .input(z.object({ commentId: z.string() }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "comment:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无评论管理权限" });
      }

      await context.db
        .update(schema.comment)
        .set({ isDeleted: false })
        .where(and(eq(schema.comment.id, input.commentId)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true };
    }),

  // 评论统计
  getCommentStats: adminProcedure.handler(async ({ context }) => {
    const canManage = await hasScope(context.db, context.session.user.id, "comment:manage");
    if (!canManage) {
      throw new ORPCError("FORBIDDEN", { message: "无评论管理权限" });
    }

    const [total, visible, hidden, deleted] = await Promise.all([
      context.db.$count(schema.comment, undefined),
      context.db.$count(
        schema.comment,
        and(eq(schema.comment.isDeleted, false), eq(schema.comment.isHidden, false)),
      ),
      context.db.$count(
        schema.comment,
        and(eq(schema.comment.isHidden, true), eq(schema.comment.isDeleted, false)),
      ),
      context.db.$count(schema.comment, and(eq(schema.comment.isDeleted, true))),
    ]);

    return { total, visible, hidden, deleted };
  }),

  // 批量评论操作
  batchCommentAction: adminProcedure
    .input(
      z.object({
        commentIds: z.array(z.string()).min(1).max(100),
        action: z.enum(["hide", "show", "delete", "restore"]),
      }),
    )
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "comment:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无评论管理权限" });
      }

      return context.db.transaction(async (tx) => {
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

        const result = await tx
          .update(schema.comment)
          .set(data)
          .where(and(inArray(schema.comment.id, input.commentIds)))
          .returning()
          .then((rows) => ({ count: rows.length }));

        return { success: true, count: result.count };
      });
    }),

  // 硬删除评论（彻底删除）
  hardDeleteComment: adminProcedure
    .input(z.object({ commentId: z.string() }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "comment:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无评论管理权限" });
      }

      return context.db.transaction(async (tx) => {
        // 先删除所有子评论（回复）
        await tx
          .delete(schema.comment)
          .where(and(eq(schema.comment.parentId, input.commentId)))
          .returning()
          .then((rows) => ({ count: rows.length }));

        // 删除评论的所有反应
        await tx
          .delete(schema.commentReaction)
          .where(and(eq(schema.commentReaction.commentId, input.commentId)))
          .returning()
          .then((rows) => ({ count: rows.length }));

        // 删除评论本身
        await tx
          .delete(schema.comment)
          .where(and(eq(schema.comment.id, input.commentId)))
          .returning()
          .then((rows) => requiredRow(rows));

        return { success: true };
      });
    }),

  // 批量硬删除评论
  batchHardDeleteComments: adminProcedure
    .input(z.object({ commentIds: z.array(z.string()).min(1).max(100) }))
    .handler(async ({ context, input }) => {
      const canManage = await hasScope(context.db, context.session.user.id, "comment:manage");
      if (!canManage) {
        throw new ORPCError("FORBIDDEN", { message: "无评论管理权限" });
      }

      return context.db.transaction(async (tx) => {
        // 先删除所有子评论
        await tx
          .delete(schema.comment)
          .where(and(inArray(schema.comment.parentId, input.commentIds)))
          .returning()
          .then((rows) => ({ count: rows.length }));

        // 删除评论的所有反应
        await tx
          .delete(schema.commentReaction)
          .where(and(inArray(schema.commentReaction.commentId, input.commentIds)))
          .returning()
          .then((rows) => ({ count: rows.length }));

        // 删除评论
        const result = await tx
          .delete(schema.comment)
          .where(and(inArray(schema.comment.id, input.commentIds)))
          .returning()
          .then((rows) => ({ count: rows.length }));

        return { success: true, count: result.count };
      });
    }),
};
