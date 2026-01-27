import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
import type { Provider } from "next-auth/providers";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";

const loginSchema = z.object({
  identifier: z.string().min(1), // 可以是邮箱或用户名
  password: z.string().min(6),
});

// 静态 providers（不需要 Request 对象）
const staticProviders: Provider[] = [
  Credentials({
    name: "credentials",
    credentials: {
      identifier: { label: "邮箱或用户名", type: "text" },
      password: { label: "密码", type: "password" },
    },
    async authorize(credentials) {
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const { identifier, password } = parsed.data;

      // 支持邮箱或用户名登录
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: identifier },
            { username: identifier },
          ],
        },
      });

      if (!user || !user.password) return null;

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.nickname || user.username,
        image: user.avatar,
      };
    },
  }),
];

// GitHub OAuth
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  staticProviders.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    })
  );
}

// Google OAuth
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  staticProviders.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    })
  );
}

// Discord OAuth
if (process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET) {
  staticProviders.push(
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 天
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: staticProviders,
  callbacks: {
    async signIn({ user, account }) {
      // OAuth 登录时，如果用户不存在则自动创建
      if (account?.provider !== "credentials" && user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (!existingUser) {
          // 生成唯一用户名
          const baseUsername = user.name?.toLowerCase().replace(/[^a-z0-9]/g, "") || "user";
          let username = baseUsername;
          let counter = 1;
          while (await prisma.user.findUnique({ where: { username } })) {
            username = `${baseUsername}${counter}`;
            counter++;
          }

          await prisma.user.create({
            data: {
              email: user.email,
              username,
              nickname: user.name,
              avatar: user.image,
            },
          });
        }
      }
      return true;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
    async jwt({ token, user, account }) {
      if (user) {
        // 获取数据库中的用户 ID
        if (account?.provider !== "credentials" && user.email) {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email },
          });
          if (dbUser) {
            token.sub = dbUser.id;
          }
        } else {
          token.sub = user.id;
        }
      }
      return token;
    },
  },
});

// 扩展 NextAuth 类型
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}
