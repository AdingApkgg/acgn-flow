import * as build from "virtual:react-router/server-build";
import { serveStatic } from "@hono/bun";
import { RPCHandler } from "@orpc/server/fetch";
import { sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { createRequestHandler } from "react-router";
import { db } from "@/db";
import { handleAuthRequest } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { httpApp } from "./http";
import { createContext } from "./orpc";
import { retireWorker } from "./retire-worker";
import { appRouter } from "./routers/_app";

export const app = new Hono();
const rpcHandler = new RPCHandler(appRouter);

const health = async (c: Context) => {
  try {
    await Promise.all([db.execute(sql`SELECT 1`), redis.ping()]);
    return c.json({
      status: "ok",
      runtime: "bun",
      revision: process.env.APP_REVISION || "development",
    });
  } catch {
    return c.json({ status: "unavailable" }, 503);
  }
};
app.get("/healthz", health);
// 保留旧容器部署 PR 的探针路径。
app.get("/api/health", health);

app.get("/sw.js", (c) =>
  c.body(retireWorker, 200, {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Service-Worker-Allowed": "/",
  }),
);

// 只为公开的 Ruffle 代码/WASM 开放匿名读取，绝不对 API 放开 CORS。
app.use("/ruffle/*", async (c, next) => {
  if (c.req.method === "GET" && /^\/ruffle\/[a-zA-Z0-9._-]+\.(?:js|wasm)$/.test(c.req.path)) {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Cross-Origin-Resource-Policy", "cross-origin");
  }
  await next();
});

// 原资源路径优先于认证 catch-all；未知路径继续交给后续路由。
app.route("/", httpApp);
app.on(["GET", "POST"], "/api/auth/*", (c) => handleAuthRequest(c.req.raw));
app.all("/api/rpc/*", async (c) => {
  const result = await rpcHandler.handle(c.req.raw, {
    prefix: "/api/rpc",
    context: await createContext({ req: c.req.raw }),
  });
  return result.response || c.json({ error: "接口不存在" }, 404);
});

if (process.env.NODE_ENV === "production") {
  app.use("/assets/*", serveStatic({ root: "./build/client" }));
  app.use("*", serveStatic({ root: "./build/client" }));
}

const render = createRequestHandler(build, process.env.NODE_ENV);
app.all("*", (c) => render(c.req.raw));

export default {
  hostname: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  fetch: app.fetch,
};
