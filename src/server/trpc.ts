import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { auth } from "@/lib/auth";
import type { Session } from "next-auth";

// Context 类型
export interface Context {
  prisma: typeof prisma;
  redis: typeof redis;
  session: Session | null;
  ipv4Address: string | null;
  ipv6Address: string | null;
  userAgent: string | null;
}

/**
 * 判断是否为 IPv6 地址
 */
function isIPv6(ip: string): boolean {
  return ip.includes(":");
}

/**
 * 判断是否为 IPv4 地址
 */
function isIPv4(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

/**
 * 从 IP 列表中提取 IPv4 和 IPv6 地址
 */
function extractIpAddresses(ips: string[]): { ipv4: string | null; ipv6: string | null } {
  let ipv4: string | null = null;
  let ipv6: string | null = null;
  
  for (const ip of ips) {
    const trimmed = ip.trim();
    if (!trimmed) continue;
    
    // 处理 IPv4 映射的 IPv6 地址 (::ffff:192.168.1.1)
    const v4MappedMatch = trimmed.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
    if (v4MappedMatch) {
      if (!ipv4) ipv4 = v4MappedMatch[1];
      continue;
    }
    
    if (isIPv6(trimmed)) {
      if (!ipv6) ipv6 = trimmed;
    } else if (isIPv4(trimmed)) {
      if (!ipv4) ipv4 = trimmed;
    }
  }
  
  return { ipv4, ipv6 };
}

// 创建 Context
export async function createContext(opts?: { req?: Request }): Promise<Context> {
  const session = await auth();
  const headers = opts?.req?.headers;
  
  // 从多个头部收集所有可能的 IP
  const forwardedFor = headers?.get("x-forwarded-for") || "";
  const realIp = headers?.get("x-real-ip") || "";
  const cfConnectingIp = headers?.get("cf-connecting-ip") || ""; // Cloudflare
  const cfConnectingIpv6 = headers?.get("cf-connecting-ipv6") || ""; // Cloudflare IPv6
  
  // 合并所有 IP 来源
  const allIps = [
    ...forwardedFor.split(","),
    realIp,
    cfConnectingIp,
    cfConnectingIpv6,
  ].filter(Boolean);
  
  const { ipv4, ipv6 } = extractIpAddresses(allIps);
  const userAgent = headers?.get("user-agent") || null;
  
  return {
    prisma,
    redis,
    session,
    ipv4Address: ipv4,
    ipv6Address: ipv6,
    userAgent,
  };
}

// 初始化 tRPC
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// 导出 router 和 procedure
export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// 认证中间件
const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user, jti: ctx.session.jti },
    },
  });
});

// 需要登录的 procedure
export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

// 管理员中间件（ADMIN 或 OWNER）
const enforceUserIsAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { role: true },
  });
  
  if (user?.role !== "ADMIN" && user?.role !== "OWNER") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

// 站长中间件（仅 OWNER）
const enforceUserIsOwner = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { role: true },
  });
  
  if (user?.role !== "OWNER") {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅站长可执行此操作" });
  }
  
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

// 管理员 procedure（ADMIN 或 OWNER）
export const adminProcedure = t.procedure.use(enforceUserIsAdmin);

// 站长 procedure（仅 OWNER）
export const ownerProcedure = t.procedure.use(enforceUserIsOwner);
