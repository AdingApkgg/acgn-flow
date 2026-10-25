import { ORPCError, os } from "@orpc/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getSession } from "@/lib/auth";
import type { AdminScope } from "@/lib/constants";
import { redis } from "@/lib/redis";
import { assertAdminScope } from "./services/permissions";

export interface Context {
  db: typeof db;
  redis: typeof redis;
  session: Awaited<ReturnType<typeof getSession>>;
  headers: Headers;
  ipv4Address: string | null;
  ipv6Address: string | null;
  userAgent: string | null;
}

export async function createContext({ req }: { req: Request }): Promise<Context> {
  const headers = req.headers;
  const addresses = [
    headers.get("cf-connecting-ip"),
    headers.get("cf-connecting-ipv6"),
    headers.get("x-real-ip"),
    ...(headers.get("x-forwarded-for") ?? "").split(","),
  ];
  let ipv4Address: string | null = null;
  let ipv6Address: string | null = null;
  for (const address of addresses) {
    const value = address?.trim();
    if (!value) continue;
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
    if (mapped) ipv4Address ??= mapped[1];
    else if (value.includes(":")) ipv6Address ??= value;
    else if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) ipv4Address ??= value;
  }
  return {
    db,
    redis,
    session: await getSession(headers),
    headers,
    ipv4Address,
    ipv6Address,
    userAgent: headers.get("user-agent"),
  };
}

export const publicProcedure = os.$context<Context>();

// 每次业务请求重新核对数据库中的封禁与角色，避免会话缓存延迟权限撤销。
export const protectedProcedure = publicProcedure.use(async ({ context, next }) => {
  if (!context.session?.user) throw new ORPCError("UNAUTHORIZED");
  const current = await context.db.query.user.findFirst({
    where: eq(user.id, context.session.user.id),
    columns: { id: true, role: true, isBanned: true, banReason: true },
  });
  if (!current) throw new ORPCError("UNAUTHORIZED");
  if (current.isBanned) {
    throw new ORPCError("FORBIDDEN", { message: current.banReason || "账号已被封禁" });
  }
  return next({
    context: {
      session: { ...context.session, user: { ...context.session.user, role: current.role } },
    },
  });
});

export const adminProcedure = protectedProcedure.use(({ context, next }) => {
  if (context.session.user.role !== "ADMIN" && context.session.user.role !== "OWNER") {
    throw new ORPCError("FORBIDDEN");
  }
  return next();
});

export const ownerProcedure = protectedProcedure.use(({ context, next }) => {
  if (context.session.user.role !== "OWNER") {
    throw new ORPCError("FORBIDDEN", { message: "仅站长可执行此操作" });
  }
  return next();
});

/** 管理员别名接口与后台入口共用同一套 scope 判定。 */
export function scopedAdminProcedure(scope: AdminScope) {
  return adminProcedure.use(async ({ context, next }) => {
    await assertAdminScope(context.db, context.session.user.id, scope);
    return next();
  });
}
