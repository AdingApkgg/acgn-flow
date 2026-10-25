import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { multiSession, username } from "better-auth/plugins";
import { eq, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { authAccount, authSession, authVerification, loginSession, user } from "@/db/schema";
import { env } from "@/env";
import { consumeCaptcha } from "@/server/http/captcha";
import { sessionIsUsable } from "./auth-policy";
import { parseDeviceInfo } from "./device-info";

const socialProviders = {
  ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
    ? {
        github: {
          clientId: process.env.AUTH_GITHUB_ID,
          clientSecret: process.env.AUTH_GITHUB_SECRET,
        },
      }
    : {}),
  ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    ? {
        google: {
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
        },
      }
    : {}),
  ...(process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET
    ? {
        discord: {
          clientId: process.env.AUTH_DISCORD_ID,
          clientSecret: process.env.AUTH_DISCORD_SECRET,
        },
      }
    : {}),
};

export const enabledAuthProviders = Object.keys(socialProviders);

export const auth = betterAuth({
  appName: env.APP_NAME,
  baseURL: env.AUTH_URL,
  basePath: "/api/auth",
  secret: env.AUTH_SECRET,
  trustedOrigins: [env.APP_URL, env.AUTH_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, account: authAccount, session: authSession, verification: authVerification },
  }),
  advanced: { database: { generateId: () => nanoid() } },
  user: {
    fields: { image: "avatar", emailVerified: "authEmailVerified" },
    additionalFields: {
      nickname: { type: "string", required: false, input: false },
      role: { type: ["USER", "ADMIN", "OWNER"], defaultValue: "USER", input: false },
      isBanned: { type: "boolean", defaultValue: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 6,
    password: {
      hash: (password) => bcrypt.hash(password, 12),
      verify: ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  // 注册、重置、换邮箱走包含服务端验证码的业务动作，不开放平行入口。
  disabledPaths: [
    "/sign-up/email",
    "/request-password-reset",
    "/reset-password",
    "/change-email",
    "/delete-user",
    "/update-user",
    "/unlink-account",
    "/change-password",
  ],
  socialProviders,
  account: { accountLinking: { enabled: true, trustedProviders: [] } },
  session: {
    expiresIn: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
    cookieCache: { enabled: false },
  },
  plugins: [
    username({
      minUsernameLength: 1,
      maxUsernameLength: 2048,
      usernameValidator: () => true,
      usernameNormalization: false,
      displayUsername: false,
    }),
    multiSession({ maximumSessions: 10 }),
  ],
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path !== "/sign-in/email" && context.path !== "/sign-in/username") return;
      const headers = context.headers || new Headers();
      if (!(await consumeCaptcha(headers, headers.get("x-captcha-answer") || ""))) {
        throw new APIError("BAD_REQUEST", { message: "验证码错误或已过期，请刷新后重试" });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          const requested =
            "username" in data && typeof data.username === "string" ? data.username : null;
          const base =
            requested ||
            data.name
              ?.toLowerCase()
              .replace(/[^a-z0-9_]/g, "")
              .slice(0, 14) ||
            "user";
          let candidate = base;
          while (
            await db.query.user.findFirst({
              where: eq(user.username, candidate),
              columns: { id: true },
            })
          ) {
            candidate = `${base.slice(0, 13)}_${nanoid(6).toLowerCase()}`;
          }
          return { data: { ...data, username: candidate, nickname: data.name || candidate } };
        },
      },
    },
    session: {
      create: {
        before: async (data) => {
          const current = await db.query.user.findFirst({
            where: eq(user.id, data.userId),
            columns: { id: true, isBanned: true },
          });
          if (!current || current.isBanned)
            throw new APIError("FORBIDDEN", { message: "账号不可用" });
          return { data };
        },
        after: async (data) => {
          const device = parseDeviceInfo(data.userAgent || null);
          await db
            .insert(loginSession)
            .values({
              userId: data.userId,
              jti: data.id,
              userAgent: data.userAgent,
              deviceType: device.deviceType,
              os: device.os,
              osVersion: device.osVersion,
              browser: device.browser,
              browserVersion: device.browserVersion,
              brand: device.brand,
              model: device.model,
              ipv4Address: data.ipAddress?.includes(":") ? null : data.ipAddress,
              ipv6Address: data.ipAddress?.includes(":") ? data.ipAddress : null,
              expiresAt: data.expiresAt,
            })
            .onConflictDoNothing({ target: loginSession.jti });
        },
      },
      delete: {
        after: async (data) => {
          await db
            .update(loginSession)
            .set({ isRevoked: true, revokedAt: new Date() })
            .where(eq(loginSession.jti, data.id));
        },
      },
    },
  },
});

/** 先按旧邮箱/用户名解析，再交给 Better Auth 验证密码与签发会话。 */
export async function handleAuthRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (
    request.method === "POST" &&
    ["/api/auth/sign-in/email", "/api/auth/sign-in/username"].includes(url.pathname)
  ) {
    let body: Record<string, unknown>;
    try {
      body = await request.clone().json();
    } catch {
      return Response.json({ message: "请求格式错误" }, { status: 400 });
    }
    const identifier = body.username ?? body.email;
    if (typeof identifier !== "string" || identifier.length === 0 || identifier.length > 2048) {
      return Response.json({ message: "账号或密码错误" }, { status: 401 });
    }
    let matches = await db
      .select({ username: user.username })
      .from(user)
      .where(or(eq(user.email, identifier), eq(user.username, identifier)))
      .limit(2);
    if (!matches.length && identifier.includes("@")) {
      matches = await db
        .select({ username: user.username })
        .from(user)
        .where(sql`lower(${user.email}) = lower(${identifier})`)
        .limit(2);
    }
    if (matches.length > 1) return Response.json({ message: "账号或密码错误" }, { status: 401 });
    url.pathname = "/api/auth/sign-in/username";
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    request = new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, username: matches[0]?.username || identifier }),
    });
  }
  // 认证库的原生账号动作也必须遵守实时封禁和审计撤销，不能绕开业务上下文。
  if (url.pathname !== "/api/auth/sign-out") {
    const nativeSession = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    if (nativeSession && !(await getSession(request.headers))) {
      return url.pathname === "/api/auth/get-session"
        ? Response.json(null)
        : Response.json({ message: "当前会话不可用" }, { status: 403 });
    }
    if (url.pathname === "/api/auth/multi-session/set-active" && request.method === "POST") {
      const body = await request
        .clone()
        .json()
        .catch(() => null);
      const token = body && typeof body.sessionToken === "string" ? body.sessionToken : "";
      const target = token
        ? await db.query.authSession.findFirst({
            where: eq(authSession.token, token),
            with: { user: true },
          })
        : null;
      const audit = target
        ? await db.query.loginSession.findFirst({
            where: eq(loginSession.jti, target.id),
            columns: { isRevoked: true },
          })
        : null;
      if (
        !target ||
        !sessionIsUsable({
          expiresAt: target.expiresAt,
          isBanned: target.user.isBanned,
          isRevoked: audit?.isRevoked ?? false,
        })
      ) {
        return Response.json({ message: "目标会话不可用" }, { status: 403 });
      }
    }
  }
  return auth.handler(request);
}

/** 会话始终从数据库读取，同时读取最新角色、封禁及审计撤销信息。 */
export async function getSession(headers: Headers) {
  const result = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!result) return null;
  const [current, audit] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.id, result.user.id) }),
    db.query.loginSession.findFirst({
      where: eq(loginSession.jti, result.session.id),
      columns: { isRevoked: true },
    }),
  ]);
  if (
    !current ||
    !sessionIsUsable({
      expiresAt: new Date(result.session.expiresAt),
      isBanned: current.isBanned,
      isRevoked: audit?.isRevoked ?? false,
    })
  )
    return null;
  return {
    session: result.session,
    jti: result.session.id,
    user: {
      ...result.user,
      id: current.id,
      email: current.email,
      username: current.username,
      name: current.nickname || current.name || current.username,
      image: current.avatar,
      role: current.role,
    },
  };
}

export type AppSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;
