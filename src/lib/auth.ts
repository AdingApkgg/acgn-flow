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
    async signIn({ user, account, profile }) {
      // 只处理 OAuth 登录
      if (account?.provider === "credentials" || !user.email) {
        return true;
      }

      // 检查是否已有相同 email 的用户
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
        include: { accounts: true },
      });

      if (existingUser) {
        // 检查是否已经关联了这个 OAuth provider
        const hasAccount = existingUser.accounts.some(
          (acc) => acc.provider === account!.provider && acc.providerAccountId === account!.providerAccountId
        );

        if (!hasAccount) {
          // 将 OAuth 账号关联到现有用户
          await prisma.account.create({
            data: {
              userId: existingUser.id,
              type: account!.type,
              provider: account!.provider,
              providerAccountId: account!.providerAccountId,
              refresh_token: account!.refresh_token,
              access_token: account!.access_token,
              expires_at: account!.expires_at,
              token_type: account!.token_type,
              scope: account!.scope,
              id_token: account!.id_token,
              session_state: account!.session_state as string | undefined,
            },
          });
        }

        // 如果 adapter 创建了一个重复的用户（没有 username），删除它
        if (user.id && user.id !== existingUser.id) {
          try {
            const duplicateUser = await prisma.user.findUnique({
              where: { id: user.id },
            });
            // 只删除由 adapter 创建的临时用户（没有 username 或刚创建的）
            if (duplicateUser && !duplicateUser.username) {
              await prisma.user.delete({ where: { id: user.id } });
            }
          } catch {
            // 忽略删除错误
          }
        }

        // 修改 user 对象以使用现有用户的 ID
        user.id = existingUser.id;
      } else {
        // 新用户：生成唯一用户名
        const baseUsername = user.name?.toLowerCase().replace(/[^a-z0-9]/g, "") || "user";
        let username = baseUsername;
        let counter = 1;
        while (await prisma.user.findUnique({ where: { username } })) {
          username = `${baseUsername}${counter}`;
          counter++;
        }

        // 更新由 adapter 创建的用户，添加 username
        if (user.id) {
          await prisma.user.update({
            where: { id: user.id },
            data: { username },
          });
        }
      }

      return true;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
        
        // 从数据库获取最新的用户信息
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { nickname: true, avatar: true, username: true },
        });
        
        if (dbUser) {
          session.user.name = dbUser.nickname || dbUser.username;
          session.user.image = dbUser.avatar;
        }
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
