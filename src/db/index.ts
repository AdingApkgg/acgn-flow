import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

// 连接池按进程复用；创建连接不会自动执行建表或迁移。
const globalDb = globalThis as typeof globalThis & { acgnPool?: Pool };
export const pool =
  globalDb.acgnPool ?? new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
if (process.env.NODE_ENV !== "production") globalDb.acgnPool = pool;

export const db = drizzle(pool, { schema });
export type Database = typeof db;
