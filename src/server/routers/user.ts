import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";

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
        role: true,
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: input,
      });

      return { success: true, user };
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
});
