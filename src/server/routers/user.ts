import { ORPCError } from "@orpc/server";
import bcrypt from "bcryptjs";
import { and, desc, eq, exists, gt, ilike, isNotNull, ne, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import * as schema from "@/db/schema";
import { auth } from "@/lib/auth";
import { type DeviceInfo, parseDeviceInfo } from "@/lib/device-info";
import { consumeVerificationCode } from "@/lib/email";
import { getIpLocation } from "@/lib/ip-location";
import { ownerProcedure, protectedProcedure, publicProcedure, scopedAdminProcedure } from "../orpc";
import { cursorCondition, escapeLike, requiredRow } from "../services/query";

export const userRouter = {
  // 注册
  register: publicProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email(),
        username: z
          .string()
          .min(3)
          .max(20)
          .regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
        password: z.string().min(6),
        code: z.string().regex(/^\d{6}$/),
        nickname: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const existingUsers = await context.db.query.user.findMany({
        where: or(
          eq(sql`lower(${schema.user.email})`, input.email),
          eq(schema.user.username, input.username),
        ),
        columns: { id: true },
        limit: 2,
      });
      if (existingUsers.length) throw new ORPCError("CONFLICT", { message: "邮箱或用户名已存在" });

      const hashedPassword = await bcrypt.hash(input.password, 12);

      const user = await context.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`account-email:${input.email}`}))`,
        );
        const duplicate = await tx.query.user.findFirst({
          where: or(
            eq(sql`lower(${schema.user.email})`, input.email),
            eq(schema.user.username, input.username),
          ),
          columns: { id: true },
        });
        if (duplicate) throw new ORPCError("CONFLICT", { message: "邮箱或用户名已存在" });
        if (!(await consumeVerificationCode(tx, input.email, input.code, "REGISTER"))) {
          throw new ORPCError("BAD_REQUEST", { message: "验证码无效或已过期" });
        }
        const created = requiredRow(
          await tx
            .insert(schema.user)
            .values({
              email: input.email,
              username: input.username,
              name: input.nickname || input.username,
              nickname: input.nickname || input.username,
              authEmailVerified: true,
              emailVerified: new Date(),
            })
            .returning(),
        );
        await tx.insert(schema.authAccount).values({
          id: nanoid(),
          userId: created.id,
          accountId: created.id,
          providerId: "credential",
          password: hashedPassword,
        });
        return created;
      });

      return { id: user.id, email: user.email, username: user.username };
    }),

  // 获取用户公开资料
  getProfile: publicProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const user = await context.db.query.user
        .findFirst({
          columns: {
            id: true,
            email: true,
            username: true,
            nickname: true,
            avatar: true,
            bio: true,
            pronouns: true,
            website: true,
            location: true,
            socialLinks: true,
            lastIpLocation: true,
            lastGpsLocation: true,
            createdAt: true,
          },
          extras: (row) => ({
            _count: sql<{
              videos: number;
              likes: number;
              favorites: number;
            }>`json_build_object('videos', (select count(*)::int from "Video" as "count_videos" where "count_videos"."uploaderId" = ${sql`${row.id}`} and ${and(eq(sql`"count_videos"."status"`, "PUBLISHED"))}), 'likes', (select count(*)::int from "Like" as "count_likes" where "count_likes"."userId" = ${sql`${row.id}`}), 'favorites', (select count(*)::int from "Favorite" as "count_favorites" where "count_favorites"."userId" = ${sql`${row.id}`}))`.as(
              "_count",
            ),
          }),
          where: and(eq(schema.user.id, input.id)),
        })
        .then((row) => row ?? null);

      if (!user) {
        throw new ORPCError("NOT_FOUND", { message: "用户不存在" });
      }

      return user;
    }),

  // 获取用户发布的视频
  getVideos: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullish(),
      }),
    )
    .handler(async ({ context, input }) => {
      const videos = await context.db.query.video.findMany({
        with: { uploader: { columns: { id: true, username: true, nickname: true, avatar: true } } },
        extras: (row) => ({
          _count: sql<{
            likes: number;
            favorites: number;
          }>`json_build_object('likes', (select count(*)::int from "Like" as "count_likes" where "count_likes"."videoId" = ${sql`${row.id}`}), 'favorites', (select count(*)::int from "Favorite" as "count_favorites" where "count_favorites"."videoId" = ${sql`${row.id}`}))`.as(
            "_count",
          ),
        }),
        where: and(
          and(eq(schema.video.uploaderId, input.userId), eq(schema.video.status, "PUBLISHED")),
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

  // 获取当前用户信息
  me: protectedProcedure.handler(async ({ context }) => {
    const user = await context.db.query.user
      .findFirst({
        columns: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          bio: true,
          pronouns: true,
          website: true,
          location: true,
          socialLinks: true,
          role: true,
          lastIpLocation: true,
          lastGpsLocation: true,
          createdAt: true,
        },
        where: and(eq(schema.user.id, context.session.user.id)),
      })
      .then((row) => row ?? null);

    if (!user) {
      throw new ORPCError("NOT_FOUND");
    }

    return user;
  }),

  // 兼容旧接口名：这里只返回设备已授权会话的标识，不签发独立登录凭据。
  generateSwitchToken: protectedProcedure.handler(async ({ context }) => ({
    token: context.session.jti,
  })),

  verifySwitchToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .handler(async ({ context, input }) => {
      const sessions = await auth.api.listDeviceSessions({ headers: context.headers });
      const authorized = sessions.find((entry) => entry.session.id === input.token);
      if (!authorized) throw new ORPCError("UNAUTHORIZED", { message: "会话已过期或未授权" });
      const user = await context.db.query.user.findFirst({
        where: and(eq(schema.user.id, authorized.user.id), eq(schema.user.isBanned, false)),
        columns: { id: true, email: true, username: true, nickname: true, avatar: true },
      });
      if (!user) throw new ORPCError("UNAUTHORIZED", { message: "会话已过期或未授权" });
      return { valid: true, user };
    }),

  // 更新个人信息
  updateProfile: protectedProcedure
    .input(
      z.object({
        nickname: z.string().min(1).max(50).optional(),
        bio: z.string().max(500).optional(),
        pronouns: z.string().max(30).optional(),
        website: z.string().url().or(z.literal("")).optional(),
        location: z.string().max(100).optional(),
        socialLinks: z
          .object({
            twitter: z.string().optional(),
            github: z.string().optional(),
            discord: z.string().optional(),
            bilibili: z.string().optional(),
            youtube: z.string().optional(),
            pixiv: z.string().optional(),
          })
          .optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const { socialLinks, ...rest } = input;
      const user = await context.db
        .update(schema.user)
        .set({
          ...rest,
          ...(rest.nickname !== undefined ? { name: rest.nickname } : {}),
          ...(socialLinks !== undefined ? { socialLinks: socialLinks } : undefined),
        })
        .where(and(eq(schema.user.id, context.session.user.id)))
        .returning()
        .then((rows) => requiredRow(rows));

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar,
          bio: user.bio,
          pronouns: user.pronouns,
          website: user.website,
          location: user.location,
          socialLinks: user.socialLinks,
          role: user.role,
          lastIpLocation: user.lastIpLocation,
          lastGpsLocation: user.lastGpsLocation,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      };
    }),

  // 获取用户设备历史（公开）
  getDevices: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .handler(async ({ context, input }) => {
      const devices = await context.db.query.userDevice.findMany({
        columns: {
          id: true,
          deviceType: true,
          os: true,
          osVersion: true,
          browser: true,
          browserVersion: true,
          brand: true,
          model: true,
          ipv4Location: true,
          ipv6Location: true,
          gpsLocation: true,
          lastActiveAt: true,
        },
        where: and(eq(schema.userDevice.userId, input.userId)),
        orderBy: [desc(schema.userDevice.lastActiveAt), desc(schema.userDevice.id)],
        limit: input.limit,
      });

      return devices;
    }),

  // 记录设备信息（登录/活动）
  recordDevice: protectedProcedure
    .input(
      z.object({
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
      const userId = context.session.user.id;

      // 获取 IPv4 和 IPv6 位置
      const [ipv4Location, ipv6Location] = await Promise.all([
        getIpLocation(context.ipv4Address),
        getIpLocation(context.ipv6Address),
      ]);

      // 如果客户端传递了设备信息（包含高精度版本），直接使用
      let normalizedDeviceInfo: DeviceInfo;
      if (input.deviceInfo?.os && input.deviceInfo.osVersion) {
        normalizedDeviceInfo = {
          deviceType: input.deviceInfo.deviceType || "desktop",
          os: input.deviceInfo.os,
          osVersion: input.deviceInfo.osVersion,
          browser: input.deviceInfo.browser || null,
          browserVersion: input.deviceInfo.browserVersion || null,
          brand: input.deviceInfo.brand || null,
          model: input.deviceInfo.model || null,
          platform: input.deviceInfo.platform || null,
          language: input.deviceInfo.language || null,
          timezone: input.deviceInfo.timezone || null,
          screen: input.deviceInfo.screen || null,
          pixelRatio: input.deviceInfo.pixelRatio || null,
          userAgent: input.deviceInfo.userAgent || context.userAgent || null,
          fingerprint: input.deviceInfo.fingerprint || "unknown",
        };
      } else {
        normalizedDeviceInfo = parseDeviceInfo(context.userAgent, input.deviceInfo);
      }

      // 更新用户最近位置（优先使用 IPv4，其次 IPv6）
      const lastIpLocation = ipv4Location || ipv6Location;
      await context.db
        .update(schema.user)
        .set({
          lastIpLocation: lastIpLocation || undefined,
          lastGpsLocation: input.gpsLocation || undefined,
        })
        .where(and(eq(schema.user.id, userId)))
        .returning()
        .then((rows) => requiredRow(rows));

      const device = await context.db
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
          gpsLocation: input.gpsLocation,
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
            gpsLocation: input.gpsLocation,
            lastActiveAt: new Date(),
          },
        })
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true, device };
    }),

  // 移除设备记录（仅本人）
  removeDevice: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const device = await context.db.query.userDevice
        .findFirst({ columns: { userId: true }, where: and(eq(schema.userDevice.id, input.id)) })
        .then((row) => row ?? null);

      if (!device || device.userId !== context.session.user.id) {
        throw new ORPCError("FORBIDDEN", { message: "无权限删除该设备" });
      }

      await context.db
        .delete(schema.userDevice)
        .where(and(eq(schema.userDevice.id, input.id)))
        .returning()
        .then((rows) => requiredRow(rows));
      return { success: true };
    }),

  // 获取登录会话列表
  getLoginSessions: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(50).default(20),
        })
        .optional(),
    )
    .handler(async ({ context, input }) => {
      const sessions = await context.db.query.loginSession.findMany({
        columns: {
          id: true,
          jti: true,
          deviceType: true,
          os: true,
          osVersion: true,
          browser: true,
          browserVersion: true,
          brand: true,
          model: true,
          ipv4Location: true,
          ipv6Location: true,
          gpsLocation: true,
          createdAt: true,
          lastActiveAt: true,
        },
        where: and(
          eq(schema.loginSession.userId, context.session.user.id),
          eq(schema.loginSession.isRevoked, false),
          gt(schema.loginSession.expiresAt, new Date()),
          exists(
            sql`(select 1 from "AuthSession" as "active_session" where "active_session"."id" = ${schema.loginSession.jti} and "active_session"."userId" = ${schema.loginSession.userId} and "active_session"."expiresAt" > ${new Date()})`,
          ),
        ),
        orderBy: [desc(schema.loginSession.lastActiveAt), desc(schema.loginSession.id)],
        limit: input?.limit || 20,
      });

      // 当前会话的 jti
      const currentJti = context.session.jti;

      return {
        sessions,
        currentJti,
      };
    }),

  // 撤销会话（登出其他设备）
  revokeLoginSession: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const loginSession = await context.db.query.loginSession
        .findFirst({
          columns: { userId: true, jti: true },
          where: and(eq(schema.loginSession.id, input.id)),
        })
        .then((row) => row ?? null);

      if (!loginSession || loginSession.userId !== context.session.user.id) {
        throw new ORPCError("FORBIDDEN", { message: "无权限撤销该会话" });
      }

      // 不允许撤销当前会话（应该用正常登出）
      if (loginSession.jti === context.session.jti) {
        throw new ORPCError("BAD_REQUEST", { message: "不能撤销当前会话，请使用登出功能" });
      }

      // 标记为已撤销
      await context.db.transaction(async (tx) => {
        await tx
          .delete(schema.authSession)
          .where(
            and(
              eq(schema.authSession.id, loginSession.jti),
              eq(schema.authSession.userId, context.session.user.id),
            ),
          );
        await tx
          .update(schema.loginSession)
          .set({ isRevoked: true, revokedAt: new Date() })
          .where(eq(schema.loginSession.id, input.id));
      });

      return { success: true };
    }),

  // 撤销所有其他会话
  revokeAllOtherSessions: protectedProcedure.handler(async ({ context }) => {
    const result = await context.db.transaction(async (tx) => {
      const revoked = await tx
        .delete(schema.authSession)
        .where(
          and(
            eq(schema.authSession.userId, context.session.user.id),
            ne(schema.authSession.id, context.session.jti),
          ),
        )
        .returning({ id: schema.authSession.id });
      await tx
        .update(schema.loginSession)
        .set({ isRevoked: true, revokedAt: new Date() })
        .where(
          and(
            eq(schema.loginSession.userId, context.session.user.id),
            ne(schema.loginSession.jti, context.session.jti),
            eq(schema.loginSession.isRevoked, false),
          ),
        );
      return { count: revoked.length };
    });

    return { count: result.count };
  }),

  // 更新账户信息（用户名、邮箱）
  updateAccount: protectedProcedure
    .input(
      z.object({
        username: z
          .string()
          .min(3, "用户名至少3个字符")
          .max(20, "用户名最多20个字符")
          .regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线")
          .optional(),
        email: z.string().trim().toLowerCase().email("请输入有效的邮箱地址").optional(),
        code: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const updates: { username?: string; email?: string } = {};

      // 检查用户名是否已存在
      if (input.username) {
        const existingUsername = await context.db.query.user
          .findFirst({
            where: and(
              eq(schema.user.username, input.username),
              ne(schema.user.id, context.session.user.id),
            ),
          })
          .then((row) => row ?? null);
        if (existingUsername) {
          throw new ORPCError("CONFLICT", { message: "用户名已被使用" });
        }
        updates.username = input.username;
      }

      // 检查邮箱是否已存在
      if (input.email) {
        const matchingUsers = await context.db.query.user.findMany({
          where: eq(sql`lower(${schema.user.email})`, input.email),
          columns: { id: true },
          limit: 2,
        });
        if (matchingUsers.length > 1)
          throw new ORPCError("CONFLICT", { message: "该邮箱存在多个历史账号，请联系管理员处理" });
        if (matchingUsers.some((user) => user.id !== context.session.user.id)) {
          throw new ORPCError("CONFLICT", { message: "邮箱已被使用" });
        }
        // 大小写等价的旧邮箱保留原值，不把只读兼容查询变成数据改写。
        if (input.email !== context.session.user.email.toLowerCase()) updates.email = input.email;
      }

      if (Object.keys(updates).length === 0) {
        return { success: true };
      }

      const emailChanged = updates.email && updates.email !== context.session.user.email;
      await context.db.transaction(async (tx) => {
        if (emailChanged && updates.email) {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${`account-email:${updates.email}`}))`,
          );
          const matching = await tx.query.user.findMany({
            where: eq(sql`lower(${schema.user.email})`, updates.email),
            columns: { id: true },
            limit: 2,
          });
          if (matching.length > 1 || matching.some((user) => user.id !== context.session.user.id))
            throw new ORPCError("CONFLICT", { message: "邮箱已被使用或存在历史冲突" });
          if (
            !input.code ||
            !(await consumeVerificationCode(tx, updates.email, input.code, "CHANGE_EMAIL"))
          ) {
            throw new ORPCError("BAD_REQUEST", { message: "请输入新邮箱收到的有效验证码" });
          }
        }
        await tx
          .update(schema.user)
          .set({
            ...updates,
            ...(emailChanged ? { authEmailVerified: true, emailVerified: new Date() } : {}),
          })
          .where(eq(schema.user.id, context.session.user.id));
      });

      return { success: true };
    }),

  // 修改密码
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(6),
      }),
    )
    .handler(async ({ context, input }) => {
      const account = await context.db.query.authAccount.findFirst({
        where: and(
          eq(schema.authAccount.userId, context.session.user.id),
          eq(schema.authAccount.providerId, "credential"),
        ),
      });
      if (!account?.password) throw new ORPCError("BAD_REQUEST", { message: "当前账号未设置密码" });
      if (!(await bcrypt.compare(input.currentPassword, account.password))) {
        throw new ORPCError("BAD_REQUEST", { message: "当前密码错误" });
      }
      const password = await bcrypt.hash(input.newPassword, 12);
      await context.db.transaction(async (tx) => {
        await tx
          .update(schema.authAccount)
          .set({ password })
          .where(eq(schema.authAccount.id, account.id));
        await tx
          .delete(schema.authSession)
          .where(
            and(
              eq(schema.authSession.userId, context.session.user.id),
              ne(schema.authSession.id, context.session.jti),
            ),
          );
        await tx
          .update(schema.loginSession)
          .set({ isRevoked: true, revokedAt: new Date() })
          .where(
            and(
              eq(schema.loginSession.userId, context.session.user.id),
              ne(schema.loginSession.jti, context.session.jti),
            ),
          );
      });

      return { success: true };
    }),

  // 重置密码（忘记密码）
  resetPassword: publicProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email(),
        newPassword: z.string().min(6, "密码至少6个字符"),
        code: z.string().regex(/^\d{6}$/),
      }),
    )
    .handler(async ({ context, input }) => {
      const matchingUsers = await context.db.query.user.findMany({
        where: eq(sql`lower(${schema.user.email})`, input.email),
        limit: 2,
      });
      if (matchingUsers.length > 1)
        throw new ORPCError("CONFLICT", { message: "该邮箱存在多个历史账号，请联系管理员处理" });
      const user = matchingUsers[0];
      if (!user) throw new ORPCError("NOT_FOUND", { message: "该邮箱未注册" });

      const hashedPassword = await bcrypt.hash(input.newPassword, 12);
      await context.db.transaction(async (tx) => {
        if (
          !(await consumeVerificationCode(
            tx,
            input.email.toLowerCase(),
            input.code,
            "RESET_PASSWORD",
          ))
        ) {
          throw new ORPCError("BAD_REQUEST", { message: "验证码无效或已过期" });
        }
        await tx
          .insert(schema.authAccount)
          .values({
            id: nanoid(),
            userId: user.id,
            accountId: user.id,
            providerId: "credential",
            password: hashedPassword,
          })
          .onConflictDoUpdate({
            target: [schema.authAccount.providerId, schema.authAccount.accountId],
            set: { password: hashedPassword },
          });
        await tx.delete(schema.authSession).where(eq(schema.authSession.userId, user.id));
        await tx
          .update(schema.loginSession)
          .set({ isRevoked: true, revokedAt: new Date() })
          .where(eq(schema.loginSession.userId, user.id));
      });

      return { success: true };
    }),

  // 注销账号（删除账号，视频转移给站长）
  deleteAccount: protectedProcedure
    .input(
      z.object({
        password: z.string().min(1, "请输入密码确认"),
        confirmText: z.literal("DELETE", { message: "请输入 DELETE 确认" }),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = context.session.user.id;

      // 获取当前用户
      const user = await context.db.query.user
        .findFirst({ columns: { id: true, role: true }, where: and(eq(schema.user.id, userId)) })
        .then((row) => row ?? null);

      if (!user) {
        throw new ORPCError("NOT_FOUND", { message: "用户不存在" });
      }

      // 站长不能注销自己的账号
      if (user.role === "OWNER") {
        throw new ORPCError("FORBIDDEN", { message: "站长账号不能注销，请先转让站长权限" });
      }

      const credential = await context.db.query.authAccount.findFirst({
        where: and(
          eq(schema.authAccount.userId, userId),
          eq(schema.authAccount.providerId, "credential"),
        ),
      });
      if (credential?.password) {
        if (!(await bcrypt.compare(input.password, credential.password))) {
          throw new ORPCError("BAD_REQUEST", { message: "密码错误" });
        }
      } else if (
        Date.now() - new Date(context.session.session.createdAt).getTime() >
        5 * 60 * 1000
      ) {
        throw new ORPCError("UNAUTHORIZED", { message: "请重新登录后再注销账号" });
      }

      // 获取站长账号
      const owner = await context.db.query.user
        .findFirst({ columns: { id: true }, where: and(eq(schema.user.role, "OWNER")) })
        .then((row) => row ?? null);

      if (!owner) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "系统错误：未找到站长账号" });
      }

      // 使用事务处理
      await context.db.transaction(async (tx) => {
        // 1. 将用户的视频转移给站长
        await tx
          .update(schema.video)
          .set({ uploaderId: owner.id })
          .where(and(eq(schema.video.uploaderId, userId)))
          .returning()
          .then((rows) => ({ count: rows.length }));

        // 2. 将用户的播放列表转移给站长
        await tx
          .update(schema.playlist)
          .set({ userId: owner.id })
          .where(and(eq(schema.playlist.userId, userId)))
          .returning()
          .then((rows) => ({ count: rows.length }));

        // 3. 删除用户（其他关联数据会通过 onDelete: Cascade 自动删除）
        // 包括：收藏、观看历史、点赞、踩、困惑、OAuth账号、会话
        await tx
          .delete(schema.user)
          .where(and(eq(schema.user.id, userId)))
          .returning()
          .then((rows) => requiredRow(rows));
      });

      return { success: true };
    }),

  // 获取已上传的头像列表（用于选择）
  getAvatarGallery: protectedProcedure.handler(async ({ context }) => {
    const avatars = new Set<string>();

    // 1. 从数据库获取已设置的头像
    const users = await context.db
      .selectDistinct({ avatar: schema.user.avatar })
      .from(schema.user)
      .where(isNotNull(schema.user.avatar))
      .limit(50);

    users.forEach((u) => {
      if (u.avatar) avatars.add(u.avatar);
    });

    // 2. 从文件系统读取已上传的头像
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    const avatarDir = path.join(uploadDir, "avatar");

    try {
      const files = await fs.readdir(avatarDir);
      const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"];

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (imageExtensions.includes(ext)) {
          avatars.add(`/uploads/avatar/${file}`);
        }
      }
    } catch {
      // 目录不存在或无法读取，忽略
    }

    return Array.from(avatars).slice(0, 50);
  }),

  // 更新头像
  updateAvatar: protectedProcedure
    .input(
      z.object({
        // 支持完整 URL 或相对路径 (如 /uploads/avatar/xxx.jpg)
        avatar: z.string().refine(
          (val) => {
            if (!val) return true; // 允许空字符串
            if (val.startsWith("/")) return true; // 相对路径
            try {
              new URL(val);
              return true;
            } catch {
              return false;
            }
          },
          { message: "请输入有效的图片URL或路径" },
        ),
      }),
    )
    .handler(async ({ context, input }) => {
      const user = await context.db
        .update(schema.user)
        .set({ avatar: input.avatar || null })
        .where(and(eq(schema.user.id, context.session.user.id)))
        .returning()
        .then((rows) => requiredRow(rows));

      return { success: true, avatar: user.avatar };
    }),

  // 获取所有用户列表（管理员）
  listUsers: scopedAdminProcedure("user:view")
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().nullish(),
        search: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const users = await context.db.query.user.findMany({
        columns: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
          createdAt: true,
        },
        extras: (row) => ({
          _count: sql<{
            videos: number;
          }>`json_build_object('videos', (select count(*)::int from "Video" as "count_videos" where "count_videos"."uploaderId" = ${sql`${row.id}`}))`.as(
            "_count",
          ),
        }),
        where: and(
          input.search
            ? and(
                or(
                  and(ilike(schema.user.username, `%${escapeLike(input.search)}%`)),
                  and(ilike(schema.user.nickname, `%${escapeLike(input.search)}%`)),
                  and(ilike(schema.user.email, `%${escapeLike(input.search)}%`)),
                ),
              )
            : undefined,
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

  // 设置用户角色（仅站长）
  setUserRole: ownerProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["USER", "ADMIN"]), // 站长只能设置为 USER 或 ADMIN
      }),
    )
    .handler(async ({ context, input }) => {
      // 不能修改自己的角色
      if (input.userId === context.session.user.id) {
        throw new ORPCError("BAD_REQUEST", { message: "不能修改自己的角色" });
      }

      // 不能修改其他站长的角色
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
        .set({ role: input.role })
        .where(and(eq(schema.user.id, input.userId)))
        .returning({ id: schema.user.id, username: schema.user.username, role: schema.user.role })
        .then((rows) => requiredRow(rows));

      return { success: true, user };
    }),

  // 转让站长权限（仅站长）
  transferOwnership: ownerProcedure
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context, input }) => {
      if (input.userId === context.session.user.id) {
        throw new ORPCError("BAD_REQUEST", { message: "不能转让给自己" });
      }

      const targetUser = await context.db.query.user
        .findFirst({ where: and(eq(schema.user.id, input.userId)) })
        .then((row) => row ?? null);

      if (!targetUser) {
        throw new ORPCError("NOT_FOUND", { message: "用户不存在" });
      }

      // 事务：将目标用户设为站长，将自己降为管理员
      await context.db.transaction(async (tx) => {
        // 锁住现任站长，串行化并发转让，并在锁后重新核对权限。
        const current = requiredRow(
          await tx
            .select({ role: schema.user.role })
            .from(schema.user)
            .where(eq(schema.user.id, context.session.user.id))
            .for("update"),
        );
        if (current.role !== "OWNER") throw new ORPCError("FORBIDDEN");
        await tx.update(schema.user).set({ role: "OWNER" }).where(eq(schema.user.id, input.userId));
        await tx
          .update(schema.user)
          .set({ role: "ADMIN" })
          .where(eq(schema.user.id, context.session.user.id));
      });

      return { success: true };
    }),

  // ==================== OAuth 账号绑定 ====================

  // 获取已绑定的 OAuth 账号
  getLinkedAccounts: protectedProcedure.handler(async ({ context }) => {
    const accounts = await context.db.query.authAccount.findMany({
      where: and(
        eq(schema.authAccount.userId, context.session.user.id),
        ne(schema.authAccount.providerId, "credential"),
      ),
      columns: { id: true, providerId: true, accountId: true },
    });
    return accounts.map((account) => ({
      id: account.id,
      provider: account.providerId,
      providerAccountId: account.accountId,
    }));
  }),

  // 解绑 OAuth 账号
  unlinkAccount: protectedProcedure
    .input(z.object({ provider: z.string() }))
    .handler(async ({ context, input }) => {
      if (input.provider === "credential")
        throw new ORPCError("BAD_REQUEST", { message: "此接口仅可解绑第三方账号" });
      await context.db.transaction(async (tx) => {
        // 同一用户的解绑串行执行，避免并发删除最后两个登录方式。
        await tx
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(eq(schema.user.id, context.session.user.id))
          .for("update");
        const accounts = await tx
          .select()
          .from(schema.authAccount)
          .where(eq(schema.authAccount.userId, context.session.user.id));
        const target = accounts.filter((account) => account.providerId === input.provider);
        if (!target.length) throw new ORPCError("NOT_FOUND", { message: "未找到该第三方账号绑定" });
        if (
          !accounts.some(
            (account) =>
              account.providerId !== input.provider &&
              (account.providerId !== "credential" || Boolean(account.password)),
          )
        ) {
          throw new ORPCError("BAD_REQUEST", {
            message: "您需要先设置密码才能解绑最后一个第三方账号",
          });
        }
        await tx
          .delete(schema.authAccount)
          .where(
            and(
              eq(schema.authAccount.userId, context.session.user.id),
              eq(schema.authAccount.providerId, input.provider),
            ),
          );
      });

      return { success: true };
    }),
};
