import { z } from "zod";
import { router, publicProcedure, protectedProcedure, ownerProcedure, adminProcedure } from "../trpc";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { getIpLocation } from "@/lib/ip-location";
import { parseDeviceInfo, type DeviceInfo } from "@/lib/device-info";

export const userRouter = router({
  // 注册
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        username: z.string().min(3).max(20),
        password: z.string().min(6),
        nickname: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existingUser = await ctx.prisma.user.findFirst({
        where: {
          OR: [{ email: input.email }, { username: input.username }],
        },
      });

      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "邮箱或用户名已存在",
        });
      }

      const hashedPassword = await bcrypt.hash(input.password, 12);

      const user = await ctx.prisma.user.create({
        data: {
          email: input.email,
          username: input.username,
          password: hashedPassword,
          nickname: input.nickname || input.username,
        },
      });

      return { id: user.id, email: user.email, username: user.username };
    }),

  // 获取用户公开资料
  getProfile: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        select: {
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
          _count: {
            select: {
              videos: { where: { status: "PUBLISHED" } },
              likes: true,
              favorites: true,
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
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
      })
    )
    .query(async ({ ctx, input }) => {
      const videos = await ctx.prisma.video.findMany({
        where: {
          uploaderId: input.userId,
          status: "PUBLISHED",
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
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

  // 获取当前用户信息
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
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
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    return user;
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
        socialLinks: z.object({
          twitter: z.string().optional(),
          github: z.string().optional(),
          discord: z.string().optional(),
          bilibili: z.string().optional(),
          youtube: z.string().optional(),
          pixiv: z.string().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { socialLinks, ...rest } = input;
      const user = await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: {
          ...rest,
          ...(socialLinks !== undefined && { socialLinks }),
        },
      });

      return { success: true, user };
    }),

  // 获取用户设备历史（公开）
  getDevices: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const devices = await ctx.prisma.userDevice.findMany({
        where: { userId: input.userId },
        orderBy: { lastActiveAt: "desc" },
        take: input.limit,
        select: {
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      
      // 获取 IPv4 和 IPv6 位置
      const [ipv4Location, ipv6Location] = await Promise.all([
        getIpLocation(ctx.ipv4Address),
        getIpLocation(ctx.ipv6Address),
      ]);
      
      // 如果客户端传递了设备信息（包含高精度版本），直接使用
      let normalizedDeviceInfo: DeviceInfo;
      if (input.deviceInfo && input.deviceInfo.os && input.deviceInfo.osVersion) {
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
          userAgent: input.deviceInfo.userAgent || ctx.userAgent || null,
          fingerprint: input.deviceInfo.fingerprint || "unknown",
        };
      } else {
        normalizedDeviceInfo = parseDeviceInfo(ctx.userAgent, input.deviceInfo);
      }

      // 更新用户最近位置（优先使用 IPv4，其次 IPv6）
      const lastIpLocation = ipv4Location || ipv6Location;
      await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          lastIpLocation: lastIpLocation || undefined,
          lastGpsLocation: input.gpsLocation || undefined,
        },
      });

      const device = await ctx.prisma.userDevice.upsert({
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
          gpsLocation: input.gpsLocation,
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
          gpsLocation: input.gpsLocation,
        },
      });

      return { success: true, device };
    }),

  // 移除设备记录（仅本人）
  removeDevice: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const device = await ctx.prisma.userDevice.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });

      if (!device || device.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权限删除该设备" });
      }

      await ctx.prisma.userDevice.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // 更新账户信息（用户名、邮箱）
  updateAccount: protectedProcedure
    .input(
      z.object({
        username: z.string().min(3, "用户名至少3个字符").max(20, "用户名最多20个字符").regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线").optional(),
        email: z.string().email("请输入有效的邮箱地址").optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updates: { username?: string; email?: string } = {};

      // 检查用户名是否已存在
      if (input.username) {
        const existingUsername = await ctx.prisma.user.findFirst({
          where: {
            username: input.username,
            NOT: { id: ctx.session.user.id },
          },
        });
        if (existingUsername) {
          throw new TRPCError({ code: "CONFLICT", message: "用户名已被使用" });
        }
        updates.username = input.username;
      }

      // 检查邮箱是否已存在
      if (input.email) {
        const existingEmail = await ctx.prisma.user.findFirst({
          where: {
            email: input.email,
            NOT: { id: ctx.session.user.id },
          },
        });
        if (existingEmail) {
          throw new TRPCError({ code: "CONFLICT", message: "邮箱已被使用" });
        }
        updates.email = input.email;
      }

      if (Object.keys(updates).length === 0) {
        return { success: true };
      }

      await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: updates,
      });

      return { success: true };
    }),

  // 修改密码
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
      });

      if (!user || !user.password) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const isValid = await bcrypt.compare(input.currentPassword, user.password);
      if (!isValid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "当前密码错误",
        });
      }

      const hashedPassword = await bcrypt.hash(input.newPassword, 12);
      await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { password: hashedPassword },
      });

      return { success: true };
    }),

  // 重置密码（忘记密码）
  resetPassword: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        newPassword: z.string().min(6, "密码至少6个字符"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "该邮箱未注册",
        });
      }

      const hashedPassword = await bcrypt.hash(input.newPassword, 12);
      await ctx.prisma.user.update({
        where: { email: input.email },
        data: { password: hashedPassword },
      });

      return { success: true };
    }),

  // 注销账号（删除账号，视频转移给站长）
  deleteAccount: protectedProcedure
    .input(
      z.object({
        password: z.string().min(1, "请输入密码确认"),
        confirmText: z.literal("DELETE", { message: "请输入 DELETE 确认" }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // 获取当前用户
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, password: true, role: true },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 站长不能注销自己的账号
      if (user.role === "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "站长账号不能注销，请先转让站长权限",
        });
      }

      // 验证密码
      if (user.password) {
        const isValid = await bcrypt.compare(input.password, user.password);
        if (!isValid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "密码错误",
          });
        }
      }

      // 获取站长账号
      const owner = await ctx.prisma.user.findFirst({
        where: { role: "OWNER" },
        select: { id: true },
      });

      if (!owner) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "系统错误：未找到站长账号",
        });
      }

      // 使用事务处理
      await ctx.prisma.$transaction(async (tx) => {
        // 1. 将用户的视频转移给站长
        await tx.video.updateMany({
          where: { uploaderId: userId },
          data: { uploaderId: owner.id },
        });

        // 2. 将用户的播放列表转移给站长
        await tx.playlist.updateMany({
          where: { userId: userId },
          data: { userId: owner.id },
        });

        // 3. 删除用户（其他关联数据会通过 onDelete: Cascade 自动删除）
        // 包括：收藏、观看历史、点赞、踩、困惑、OAuth账号、会话
        await tx.user.delete({
          where: { id: userId },
        });
      });

      return { success: true };
    }),

  // 获取已上传的头像列表（用于选择）
  getAvatarGallery: protectedProcedure.query(async ({ ctx }) => {
    const avatars = new Set<string>();

    // 1. 从数据库获取已设置的头像
    const users = await ctx.prisma.user.findMany({
      where: {
        avatar: { not: null },
      },
      select: {
        avatar: true,
      },
      distinct: ["avatar"],
      take: 50,
    });

    users.forEach((u) => {
      if (u.avatar) avatars.add(u.avatar);
    });

    // 2. 从文件系统读取已上传的头像
    const fs = await import("fs/promises");
    const path = await import("path");
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
          { message: "请输入有效的图片URL或路径" }
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { avatar: input.avatar || null },
      });

      return { success: true, avatar: user.avatar };
    }),

  // 获取所有用户列表（管理员）
  listUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().nullish(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const users = await ctx.prisma.user.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: input.search
          ? {
              OR: [
                { username: { contains: input.search, mode: "insensitive" } },
                { nickname: { contains: input.search, mode: "insensitive" } },
                { email: { contains: input.search, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          avatar: true,
          role: true,
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

  // 设置用户角色（仅站长）
  setUserRole: ownerProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["USER", "ADMIN"]), // 站长只能设置为 USER 或 ADMIN
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 不能修改自己的角色
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能修改自己的角色" });
      }

      // 不能修改其他站长的角色
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
        data: { role: input.role },
        select: { id: true, username: true, role: true },
      });

      return { success: true, user };
    }),

  // 转让站长权限（仅站长）
  transferOwnership: ownerProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能转让给自己" });
      }

      const targetUser = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
      });

      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 事务：将目标用户设为站长，将自己降为管理员
      await ctx.prisma.$transaction([
        ctx.prisma.user.update({
          where: { id: input.userId },
          data: { role: "OWNER" },
        }),
        ctx.prisma.user.update({
          where: { id: ctx.session.user.id },
          data: { role: "ADMIN" },
        }),
      ]);

      return { success: true };
    }),

  // ==================== OAuth 账号绑定 ====================

  // 获取已绑定的 OAuth 账号
  getLinkedAccounts: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await ctx.prisma.account.findMany({
      where: { userId: ctx.session.user.id },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
      },
    });

    return accounts.map((account) => ({
      id: account.id,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
    }));
  }),

  // 解绑 OAuth 账号
  unlinkAccount: protectedProcedure
    .input(z.object({ provider: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // 检查用户是否有密码（如果没有密码且只有一个 OAuth 账号，不能解绑）
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { password: true },
      });

      const accountCount = await ctx.prisma.account.count({
        where: { userId: ctx.session.user.id },
      });

      // 如果没有密码且只有一个 OAuth 账号，不能解绑
      if (!user?.password && accountCount <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "您需要先设置密码才能解绑最后一个第三方账号",
        });
      }

      // 删除绑定
      const deleted = await ctx.prisma.account.deleteMany({
        where: {
          userId: ctx.session.user.id,
          provider: input.provider,
        },
      });

      if (deleted.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "未找到该第三方账号绑定",
        });
      }

      return { success: true };
    }),
});
