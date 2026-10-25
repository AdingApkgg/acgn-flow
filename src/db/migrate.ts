import { readFile } from "node:fs/promises";
import { nanoid } from "nanoid";
import type { PoolClient, QueryResult } from "pg";
import { legacyTables } from "./legacy";

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const baselineUrl = new URL("../../drizzle/baseline/0000_legacy.sql", import.meta.url);
const authMigrationUrl = new URL("../../drizzle/migrations/0001_auth.sql", import.meta.url);
const contentTypeMigrationUrl = new URL(
  "../../drizzle/migrations/0002_content_type.sql",
  import.meta.url,
);

export type TableSnapshot = { count: string; ids: string; values: string; contentType?: string };
export type DatabaseSnapshot = Record<string, TableSnapshot>;

/** 冻结原字段摘要；main 后加的内容类型若已存在，则额外绑定业务 ID 核对。 */
export async function snapshotLegacy(
  client: PoolClient,
  options: { includeContentType?: boolean } = {},
): Promise<DatabaseSnapshot> {
  const snapshot: DatabaseSnapshot = {};
  let hasContentType = false;
  if (options.includeContentType !== false) {
    const { rows } = await client.query<{ exists: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'Video' AND column_name = 'contentType') AS exists`);
    hasContentType = rows[0].exists;
  }
  for (const [name, definition] of Object.entries(legacyTables)) {
    const columns = definition.columns.map(quote).join(", ");
    const identity = definition.identity.map(quote).join(", ");
    const contentType =
      name === "Video" && hasContentType
        ? ', COALESCE(sum(hashtextextended(jsonb_build_array("id", "contentType")::text, 0)::numeric), 0)::text AS "contentType"'
        : "";
    const { rows } = await client.query<TableSnapshot>(`
      SELECT count(*)::text AS count,
        COALESCE(sum(hashtextextended(jsonb_build_array(${identity})::text, 0)::numeric), 0)::text AS ids,
        COALESCE(sum(hashtextextended(jsonb_build_array(${columns})::text, 0)::numeric), 0)::text AS values
        ${contentType}
      FROM ${quote(name)}
    `);
    snapshot[name] = rows[0];
  }
  return snapshot;
}

export function assertLegacyUnchanged(before: DatabaseSnapshot, after: DatabaseSnapshot) {
  for (const table of Object.keys(legacyTables)) {
    const left = before[table];
    const right = after[table];
    if (
      !left ||
      !right ||
      left.count !== right.count ||
      left.ids !== right.ids ||
      left.values !== right.values ||
      (left.contentType !== undefined && left.contentType !== right.contentType)
    ) {
      throw new Error(`Legacy data changed during migration: ${table}`);
    }
  }
}

async function assertLegacyTables(client: PoolClient) {
  for (const table of Object.keys(legacyTables)) {
    const { rows } = await client.query<{ name: string | null }>(
      "SELECT to_regclass($1)::text AS name",
      [quote(table)],
    );
    if (!rows[0]?.name)
      throw new Error(`Missing legacy table ${table}; use db:init only for an empty database`);
  }
}

async function transaction<T>(client: PoolClient, action: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    // 串行化显式迁移，避免两个运维进程同时复制账号。
    await client.query("SELECT pg_advisory_xact_lock(hashtext('acgn-flow-auth-v1'))");
    const value = await action();
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

type LegacyCredential = { id: string; password: string; createdAt: Date; updatedAt: Date };
type LegacyOAuth = {
  sourceId: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  expires_at: number | null;
  scope: string | null;
  createdAt: Date;
  updatedAt: Date;
};

async function insertAccount(
  client: PoolClient,
  value: {
    userId: string;
    providerId: string;
    accountId: string;
    password?: string;
    accessToken?: string | null;
    refreshToken?: string | null;
    idToken?: string | null;
    accessTokenExpiresAt?: Date | null;
    scope?: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
) {
  const existing = await client.query<{ userId: string }>(
    'SELECT "userId" FROM "AuthAccount" WHERE "providerId" = $1 AND "accountId" = $2',
    [value.providerId, value.accountId],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].userId !== value.userId) {
      throw new Error(`Authentication account ownership conflict (${value.providerId})`);
    }
    // 已切换的密码/令牌是认证真源，重跑不得用历史值覆盖。
    return false;
  }
  await client.query(
    `INSERT INTO "AuthAccount"
    ("id", "userId", "providerId", "accountId", "password", "accessToken", "refreshToken", "idToken",
     "accessTokenExpiresAt", "scope", "createdAt", "updatedAt")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      nanoid(),
      value.userId,
      value.providerId,
      value.accountId,
      value.password ?? null,
      value.accessToken ?? null,
      value.refreshToken ?? null,
      value.idToken ?? null,
      // Unix epoch 是 UTC；显式 ISO 字符串避免 pg 按本机时区写入无时区列。
      value.accessTokenExpiresAt?.toISOString() ?? null,
      value.scope ?? null,
      value.createdAt,
      value.updatedAt,
    ],
  );
  return true;
}

async function applyAuthMigration(client: PoolClient) {
  await client.query(await readFile(authMigrationUrl, "utf8"));
  const { rows: applied } = await client.query<{ applied: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM "_AcgnMigration" WHERE "version" = $1) AS applied',
    ["auth-v1"],
  );
  // 成功切换后 AuthAccount 是真源；历史账号不再回灌，避免复活主动解绑的登录方式。
  if (applied[0].applied) {
    return { credentialsAdded: 0, oauthAdded: 0, alreadyApplied: true };
  }
  let credentialsAdded = 0;
  let oauthAdded = 0;
  let userCursor: string | null = null;
  while (true) {
    const credentials: QueryResult<LegacyCredential> = await client.query<LegacyCredential>(
      `SELECT "id", "password", "createdAt", "updatedAt" FROM "User"
       WHERE "password" IS NOT NULL AND ($1::text IS NULL OR "id" > $1) ORDER BY "id" LIMIT 500`,
      [userCursor],
    );
    if (credentials.rows.length === 0) break;
    for (const row of credentials.rows) {
      if (
        await insertAccount(client, {
          ...row,
          userId: row.id,
          providerId: "credential",
          accountId: row.id,
        })
      )
        credentialsAdded++;
    }
    userCursor = credentials.rows[credentials.rows.length - 1].id;
  }
  let accountCursor: string | null = null;
  while (true) {
    const oauth: QueryResult<LegacyOAuth> = await client.query<LegacyOAuth>(
      `SELECT a.*, a."id" AS "sourceId", u."createdAt", u."updatedAt"
      FROM "Account" a JOIN "User" u ON u."id" = a."userId"
      WHERE ($1::text IS NULL OR a."id" > $1) ORDER BY a."id" LIMIT 500`,
      [accountCursor],
    );
    if (oauth.rows.length === 0) break;
    for (const row of oauth.rows) {
      if (row.provider === "credential")
        throw new Error("Legacy OAuth provider uses reserved credential providerId");
      const expiresAt = row.expires_at === null ? null : new Date(row.expires_at * 1000);
      if (expiresAt && Number.isNaN(expiresAt.getTime()))
        throw new Error("Invalid legacy OAuth token expiry");
      if (
        await insertAccount(client, {
          userId: row.userId,
          providerId: row.provider,
          accountId: row.providerAccountId,
          accessToken: row.access_token,
          refreshToken: row.refresh_token,
          idToken: row.id_token,
          accessTokenExpiresAt: expiresAt,
          scope: row.scope,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })
      )
        oauthAdded++;
    }
    accountCursor = oauth.rows[oauth.rows.length - 1].sourceId;
  }
  // 旧 JWT/Session/验证码不转为有效认证会话；切换后重新登录。
  await client.query(
    'INSERT INTO "_AcgnMigration" ("version") VALUES ($1) ON CONFLICT DO NOTHING',
    ["auth-v1"],
  );
  return { credentialsAdded, oauthAdded, alreadyApplied: false };
}

export async function upgradeLegacyDatabase(client: PoolClient) {
  return transaction(client, async () => {
    await assertLegacyTables(client);
    // 阻止业务并发写入，保证摘要和账号复制使用同一稳定快照。
    await client.query(
      `LOCK TABLE ${Object.keys(legacyTables).map(quote).join(", ")} IN SHARE MODE`,
    );
    const before = await snapshotLegacy(client);
    await client.query(await readFile(contentTypeMigrationUrl, "utf8"));
    const accounts = await applyAuthMigration(client);
    // 缺列旧库只核对本轮迁移前已有字段；已含 FLASH 的库必须核对类型摘要。
    const after = await snapshotLegacy(client, {
      includeContentType: before.Video.contentType !== undefined,
    });
    assertLegacyUnchanged(before, after);
    return { ...accounts, before, after };
  });
}

export async function initializeDatabase(client: PoolClient) {
  return transaction(client, async () => {
    const { rows } = await client.query<{ count: string }>(`SELECT count(*)::text AS count
      FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`);
    if (rows[0].count !== "0")
      throw new Error("db:init requires an empty schema; existing databases must use db:upgrade");
    await client.query(await readFile(baselineUrl, "utf8"));
    await client.query(await readFile(contentTypeMigrationUrl, "utf8"));
    await applyAuthMigration(client);
    return snapshotLegacy(client);
  });
}
