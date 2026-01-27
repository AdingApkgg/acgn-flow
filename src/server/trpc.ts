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
}

// 创建 Context
export async function createContext(): Promise<Context> {
  const session = await auth();
  
  return {
    prisma,
    redis,
    session,
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
      session: { ...ctx.session, user: ctx.session.user },
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
