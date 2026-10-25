import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireTestDatabaseUrl } from "../src/db/safety";

describe.skipIf(process.env.RUN_AUTH_INTEGRATION !== "1")("Better Auth 真实登录与撤销", () => {
  const prefix = `auth-${nanoid(8)}`;
  const password = "migration-fixture-password";
  const ids = ["legacy", "upper", "banned"].map((name) => `${prefix}-${name}`);
  let db: typeof import("../src/db").db;
  let pool: typeof import("../src/db").pool;
  let redis: typeof import("../src/lib/redis").redis;
  let handleAuthRequest: typeof import("../src/lib/auth").handleAuthRequest;
  let getSession: typeof import("../src/lib/auth").getSession;
  const challenges: string[] = [];

  beforeAll(async () => {
    const url = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL);
    if (url !== process.env.DATABASE_URL) throw new Error("认证测试只能使用同一个专用测试库");
    ({ db, pool } = await import("../src/db"));
    ({ redis } = await import("../src/lib/redis"));
    ({ handleAuthRequest, getSession } = await import("../src/lib/auth"));
    const { user, authAccount } = await import("../src/db/schema");
    await db.insert(user).values([
      {
        id: ids[0],
        username: `${prefix}@旧用户名`,
        email: `${prefix}@example.test`,
        name: "旧用户名",
        role: "OWNER",
      },
      {
        id: ids[1],
        username: `${prefix}-mixed`,
        email: `${prefix}.Mixed@Example.Test`,
        name: "大小写邮箱",
      },
      {
        id: ids[2],
        username: `${prefix}-banned`,
        email: `${prefix}.banned@example.test`,
        name: "封禁用户",
        isBanned: true,
      },
    ]);
    const hash = await bcrypt.hash(password, 4);
    await db
      .insert(authAccount)
      .values(
        ids.map((id) => ({ userId: id, accountId: id, providerId: "credential", password: hash })),
      );
  });

  afterAll(async () => {
    if (!db) return;
    const { user } = await import("../src/db/schema");
    await db.delete(user).where(inArray(user.id, ids));
    if (challenges.length) await redis.del(...challenges);
    await pool.end();
    redis.disconnect();
  });

  async function signIn(
    identifier: string,
    options: { captcha?: boolean; answer?: string; cookie?: string } = {},
  ) {
    const origin = process.env.APP_URL || "http://127.0.0.1:31270";
    const headers = new Headers({ "content-type": "application/json", origin });
    let cookie = options.cookie || "";
    if (options.captcha !== false) {
      const challenge = randomUUID();
      const key = `captcha:challenge:${challenge}`;
      challenges.push(key);
      await redis.set(key, "3", "EX", 60);
      cookie += `${cookie ? "; " : ""}acgn-captcha=${challenge}`;
      headers.set("x-captcha-answer", options.answer || "3");
    }
    if (cookie) headers.set("cookie", cookie);
    return handleAuthRequest(
      new Request(`${origin}/api/auth/sign-in/username`, {
        method: "POST",
        headers,
        body: JSON.stringify({ username: identifier, password }),
      }),
    );
  }

  function cookies(response: Response, previous = "") {
    const jar = new Map(
      previous
        .split("; ")
        .filter(Boolean)
        .map((part) => {
          const index = part.indexOf("=");
          return [part.slice(0, index), part.slice(index + 1)];
        }),
    );
    for (const value of response.headers.getSetCookie()) {
      const part = value.split(";")[0];
      const index = part.indexOf("=");
      jar.set(part.slice(0, index), part.slice(index + 1));
    }
    return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  test("无法绕过验证码直接使用有效密码登录", async () => {
    expect((await signIn(`${prefix}@旧用户名`, { captcha: false })).status).toBe(400);
    expect((await signIn(`${prefix}@旧用户名`, { answer: "4" })).status).toBe(400);
  });

  test("包含中文与@的旧用户名保留密码登录及原角色", async () => {
    const response = await signIn(`${prefix}@旧用户名`);
    expect(response.status).toBe(200);
    const session = await getSession(new Headers({ cookie: cookies(response) }));
    expect(session?.user.id).toBe(ids[0]);
    expect(session?.user.role).toBe("OWNER");
  });

  test("原大小写邮箱及唯一的大小写无关邮箱均可登录且不改旧值", async () => {
    for (const email of [`${prefix}.Mixed@Example.Test`, `${prefix}.mixed@example.test`]) {
      const response = await signIn(email);
      expect(response.status).toBe(200);
      expect((await getSession(new Headers({ cookie: cookies(response) })))?.user.id).toBe(ids[1]);
    }
    const { user } = await import("../src/db/schema");
    expect((await db.query.user.findFirst({ where: eq(user.id, ids[1]) }))?.email).toBe(
      `${prefix}.Mixed@Example.Test`,
    );
  });

  test("封禁用户无法签发会话", async () => {
    expect((await signIn(`${prefix}-banned`)).status).toBe(403);
  });

  test("已有会话被封禁后，原生认证接口同样失效", async () => {
    const response = await signIn(`${prefix}@旧用户名`);
    const headers = new Headers({
      cookie: cookies(response),
      "content-type": "application/json",
      origin: process.env.APP_URL || "http://127.0.0.1:31270",
    });
    const { user } = await import("../src/db/schema");
    await db.update(user).set({ isBanned: true }).where(eq(user.id, ids[0]));
    try {
      const origin = process.env.APP_URL || "http://127.0.0.1:31270";
      const sessionResponse = await handleAuthRequest(
        new Request(`${origin}/api/auth/get-session`, { headers }),
      );
      expect(await sessionResponse.json()).toBeNull();
      const link = await handleAuthRequest(
        new Request(`${origin}/api/auth/link-social`, {
          method: "POST",
          headers,
          body: JSON.stringify({ provider: "github" }),
        }),
      );
      expect(link.status).toBe(403);
    } finally {
      await db.update(user).set({ isBanned: false }).where(eq(user.id, ids[0]));
    }
  });

  test("改密原生平行入口关闭，统一使用带撤销逻辑的业务动作", async () => {
    const response = await signIn(`${prefix}@旧用户名`);
    const origin = process.env.APP_URL || "http://127.0.0.1:31270";
    const result = await handleAuthRequest(
      new Request(`${origin}/api/auth/change-password`, {
        method: "POST",
        headers: { cookie: cookies(response), origin, "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: password,
          newPassword: "changed-fixture-password",
        }),
      }),
    );
    expect(result.status).toBe(404);
  });

  test("数据库会话撤销立即生效，Cookie缓存不能恢复旧登录态", async () => {
    const response = await signIn(`${prefix}@旧用户名`);
    const headers = new Headers({ cookie: cookies(response) });
    const session = await getSession(headers);
    expect(session).not.toBeNull();
    const { authSession } = await import("../src/db/schema");
    await db.delete(authSession).where(eq(authSession.id, session?.session.id || ""));
    expect(await getSession(headers)).toBeNull();
  });

  test("多账号切换不能激活已撤销的目标会话", async () => {
    const first = await signIn(`${prefix}@旧用户名`);
    const firstCookie = cookies(first);
    const firstSession = await getSession(new Headers({ cookie: firstCookie }));
    expect(firstSession).not.toBeNull();
    const second = await signIn(`${prefix}-mixed`, { cookie: firstCookie });
    expect(second.status).toBe(200);
    const cookie = cookies(second, firstCookie);
    const { loginSession } = await import("../src/db/schema");
    await db
      .update(loginSession)
      .set({ isRevoked: true })
      .where(eq(loginSession.jti, firstSession?.jti || ""));
    const origin = process.env.APP_URL || "http://127.0.0.1:31270";
    const response = await handleAuthRequest(
      new Request(`${origin}/api/auth/multi-session/set-active`, {
        method: "POST",
        headers: { cookie, origin, "content-type": "application/json" },
        body: JSON.stringify({ sessionToken: firstSession?.session.token }),
      }),
    );
    expect(response.status).toBe(403);
    expect((await getSession(new Headers({ cookie })))?.user.id).toBe(ids[1]);
  });

  test("未登录访问或并行旧入口不能解绑账户", async () => {
    const origin = process.env.APP_URL || "http://127.0.0.1:31270";
    const response = await handleAuthRequest(
      new Request(`${origin}/api/auth/unlink-account`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ providerId: "github" }),
      }),
    );
    expect(response.status).toBe(404);
  });
});
