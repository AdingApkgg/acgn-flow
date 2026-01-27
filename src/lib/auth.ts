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
  email: z.string().email(),
  password: z.string().min(6),
});

// 动态构建 providers 列表
const providers: Provider[] = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({
        where: { email },
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
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    })
  );
}

// Google OAuth
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    })
  );
}

// Discord OAuth
if (process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET) {
  providers.push(
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
    })
  );
}

// Steam OpenID (自定义实现)
if (process.env.AUTH_STEAM_KEY) {
  providers.push({
    id: "steam",
    name: "Steam",
    type: "oauth",
    authorization: {
      url: "https://steamcommunity.com/openid/login",
      params: {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": `${process.env.AUTH_URL}/api/auth/callback/steam`,
        "openid.realm": process.env.AUTH_URL,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
      },
    },
    token: {
      async request({ params }: { params: Record<string, unknown> }) {
        // Steam 使用 OpenID，不需要 token 交换
        const claimedId = params["openid.claimed_id"] as string;
        const steamId = claimedId?.split("/").pop();
        return { tokens: { access_token: steamId } };
      },
    },
    userinfo: {
      async request({ tokens }: { tokens: { access_token?: string } }) {
        const steamId = tokens.access_token;
        const res = await fetch(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.AUTH_STEAM_KEY}&steamids=${steamId}`
        );
        const data = await res.json();
        const player = data.response?.players?.[0];
        return {
          id: steamId,
          name: player?.personaname,
          image: player?.avatarfull,
          email: null,
        };
      },
    },
    profile(profile) {
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        image: profile.image,
      };
    },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers,
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
