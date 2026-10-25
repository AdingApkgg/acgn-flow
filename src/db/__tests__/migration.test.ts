import { expect, test } from "bun:test";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { nanoid } from "nanoid";
import { Pool, type PoolClient } from "pg";
import { checkDatabase } from "../check";
import {
  assertLegacyUnchanged,
  initializeDatabase,
  snapshotLegacy,
  upgradeLegacyDatabase,
} from "../migrate";
import { requireTestDatabaseUrl } from "../safety";
import * as schema from "../schema";
import { seedTags } from "../seed";
import { createLegacyFixture, fixturePassword } from "./fixture";

// 没有专用测试库即失败，不跳过，也不使用应用的 DATABASE_URL。
const connectionString = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL);

async function withIsolatedSchema(action: (client: PoolClient) => Promise<void>) {
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  const name = `acgn_migration_test_${nanoid(12).replaceAll(/[^a-zA-Z0-9]/g, "")}`;
  let created = false;
  try {
    const { rows } = await client.query<{ database: string }>(
      "SELECT current_database() AS database",
    );
    const requested = decodeURIComponent(new URL(connectionString).pathname.slice(1));
    expect(rows[0].database).toBe(requested);
    await client.query(`CREATE SCHEMA "${name}"`);
    created = true;
    await client.query(`SET search_path TO "${name}"`);
    await client.query("SET TIME ZONE 'UTC'");
    await action(client);
  } finally {
    if (created) {
      await client.query("ROLLBACK");
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA "${name}" CASCADE`);
    }
    client.release();
    await pool.end();
  }
}

test("空库初始化支持关系查询、nanoid、默认值、更新时间及级联更新", async () => {
  await withIsolatedSchema(async (client) => {
    const snapshot = await initializeDatabase(client);
    expect(Object.keys(snapshot)).toHaveLength(24);
    expect(Object.values(snapshot).every((entry) => entry.count === "0")).toBe(true);
    const { rows: constraints } = await client.query<{
      cascade: number;
      setNull: number;
      updateCascade: number;
    }>(`
      SELECT count(*) FILTER (WHERE confdeltype = 'c')::int AS cascade,
        count(*) FILTER (WHERE confdeltype = 'n')::int AS "setNull",
        count(*) FILTER (WHERE confupdtype = 'c')::int AS "updateCascade"
      FROM pg_constraint WHERE connamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema()) AND contype = 'f'`);
    expect(constraints[0]).toEqual({ cascade: 32, setNull: 5, updateCascade: 37 });
    const { rows: enums } = await client.query<{
      enumlabel: string;
    }>(`SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema()) AND t.typname = 'Role' ORDER BY enumsortorder`);
    expect(enums.map((item) => item.enumlabel)).toEqual(["USER", "ADMIN", "OWNER"]);
    const db = drizzle(client, { schema });
    const [owner] = await db
      .insert(schema.user)
      .values({ email: "new@example.invalid", username: "new_user", name: "新用户" })
      .returning();
    expect(owner.id).toMatch(/^[\w-]{21}$/);
    expect(owner.role).toBe("USER");
    expect(owner.authEmailVerified).toBe(false);
    expect(owner.emailVerified).toBeNull();
    const [video] = await db
      .insert(schema.video)
      .values({ title: "新视频", videoUrl: "https://example.invalid/v.mp4", uploaderId: owner.id })
      .returning();
    expect(video.status).toBe("PENDING");
    expect(video.contentType).toBe("VIDEO");
    expect(video.views).toBe(0);
    expect(video.updatedAt).toBeInstanceOf(Date);
    const [flash] = await db
      .insert(schema.video)
      .values({
        title: "Flash 作品",
        videoUrl: "/uploads/fixture.swf",
        uploaderId: owner.id,
        contentType: "FLASH",
      })
      .returning();
    expect(flash.contentType).toBe("FLASH");
    const related = await db.query.user.findFirst({
      where: eq(schema.user.id, owner.id),
      with: { videos: true, authAccounts: true },
    });
    expect(related?.videos.map((item) => item.id).sort()).toEqual([video.id, flash.id].sort());
    expect(related?.authAccounts).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const [updated] = await db
      .update(schema.user)
      .set({ nickname: "更新昵称" })
      .where(eq(schema.user.id, owner.id))
      .returning();
    expect(updated.updatedAt.getTime()).toBeGreaterThan(owner.updatedAt.getTime());
    await db.update(schema.user).set({ id: "changed_id" }).where(eq(schema.user.id, owner.id));
    expect(
      (await db.query.video.findFirst({ where: eq(schema.video.id, video.id) }))?.uploaderId,
    ).toBe("changed_id");
    await db.delete(schema.user).where(eq(schema.user.id, "changed_id"));
    expect(
      await db.query.video.findFirst({ where: eq(schema.video.id, video.id) }),
    ).toBeUndefined();
    await expect(initializeDatabase(client)).rejects.toThrow("empty schema");
  });
});

test("旧库升级完整保留 24 表、bcrypt、OAuth、历史会话且可重复执行", async () => {
  await withIsolatedSchema(async (client) => {
    const fixture = await createLegacyFixture(client);
    const before = await snapshotLegacy(client);
    expect(Object.values(before).every((entry) => Number(entry.count) > 0)).toBe(true);
    const first = await upgradeLegacyDatabase(client);
    expect(first.credentialsAdded).toBe(fixture.credentials);
    expect(first.oauthAdded).toBe(fixture.oauth);
    expect(first.before).toEqual(first.after);
    assertLegacyUnchanged(before, first.after);
    const db = drizzle(client, { schema });
    const owner = await db.query.user.findFirst({
      where: eq(schema.user.id, "fixture_owner"),
      with: { authAccounts: true, accounts: true, videos: true },
    });
    expect(owner?.name).toBe("旧昵称");
    expect(owner?.authEmailVerified).toBe(true);
    expect(owner?.emailVerified).toBeInstanceOf(Date);
    expect(owner?.role).toBe("OWNER");
    expect(owner?.videos[0]?.id).toBe("fixture_video");
    expect(owner?.videos[0]?.contentType).toBe("VIDEO");
    const credential = owner?.authAccounts.find((item) => item.providerId === "credential");
    expect(credential?.accountId).toBe("fixture_owner");
    expect(credential?.password).toBe(fixture.password);
    expect(await compare(fixturePassword, credential?.password ?? "")).toBe(true);
    const oauth = await db.query.authAccount.findMany({
      where: eq(schema.authAccount.userId, "fixture_user"),
    });
    expect(oauth.map((item) => `${item.providerId}:${item.accountId}`).sort()).toEqual([
      "discord:external_discord",
      "google:external_google",
    ]);
    expect(oauth[0].accessTokenExpiresAt?.toISOString()).toBe("2030-03-17T17:46:40.000Z");
    const { rows: expiry } = await client.query(
      `SELECT to_char("accessTokenExpiresAt", 'YYYY-MM-DD HH24:MI:SS') AS value FROM "AuthAccount" WHERE "providerId" = 'google'`,
    );
    expect(expiry[0].value).toBe("2030-03-17 17:46:40");
    expect(await db.query.authSession.findMany()).toEqual([]);
    expect(await db.query.authVerification.findMany()).toEqual([]);
    expect((await db.query.loginSession.findFirst())?.isRevoked).toBe(true);
    expect(await db.query.session.findMany()).toHaveLength(1);
    // 新认证写入后的值不能被历史密码和令牌回填覆盖。
    await db
      .update(schema.authAccount)
      .set({ password: "new-auth-password-hash" })
      .where(eq(schema.authAccount.id, credential?.id ?? ""));
    await db
      .update(schema.authAccount)
      .set({ accessToken: "new-auth-token" })
      .where(eq(schema.authAccount.providerId, "google"));
    await db
      .update(schema.user)
      .set({ authEmailVerified: false })
      .where(eq(schema.user.id, "fixture_owner"));
    const afterAuthChange = await snapshotLegacy(client);
    const second = await upgradeLegacyDatabase(client);
    expect(second.credentialsAdded).toBe(0);
    expect(second.oauthAdded).toBe(0);
    assertLegacyUnchanged(afterAuthChange, second.after);
    expect(
      (
        await db.query.authAccount.findFirst({
          where: eq(schema.authAccount.id, credential?.id ?? ""),
        })
      )?.password,
    ).toBe("new-auth-password-hash");
    expect(
      (await db.query.authAccount.findFirst({ where: eq(schema.authAccount.providerId, "google") }))
        ?.accessToken,
    ).toBe("new-auth-token");
    expect(
      (await db.query.user.findFirst({ where: eq(schema.user.id, "fixture_owner") }))
        ?.authEmailVerified,
    ).toBe(false);
    // 原 Account 是历史记录；用户主动解绑后重跑不能恢复已撤销的 OAuth 入口。
    await db.delete(schema.authAccount).where(eq(schema.authAccount.providerId, "github"));
    const afterUnlink = await upgradeLegacyDatabase(client);
    expect(afterUnlink.oauthAdded).toBe(0);
    expect(
      await db.query.authAccount.findFirst({ where: eq(schema.authAccount.providerId, "github") }),
    ).toBeUndefined();
    expect(
      await db.query.account.findFirst({ where: eq(schema.account.provider, "github") }),
    ).toBeDefined();
    const audit = await checkDatabase(client);
    expect(typeof audit.authentication).toBe("object");
    if (typeof audit.authentication === "object") {
      expect(audit.authentication.migrationApplied).toBe(true);
      expect(audit.authentication.legacyOAuthWithoutLiveAccount).toBe(1);
    }
    // 安全种子不删除原标签及视频关联，第二次添加数为 0。
    expect((await seedTags(client)).added).toBeGreaterThan(0);
    expect((await seedTags(client)).added).toBe(0);
    expect(await db.query.tag.findFirst({ where: eq(schema.tag.id, "fixture_tag") })).toBeDefined();
    expect(await db.query.tagOnVideo.findMany()).toHaveLength(1);
    // SetNull 与 Cascade 延续旧结构，回复不会因删除父评论而丢失。
    await db.delete(schema.comment).where(eq(schema.comment.id, "fixture_comment"));
    expect(
      (await db.query.comment.findFirst({ where: eq(schema.comment.id, "fixture_comment_reply") }))
        ?.parentId,
    ).toBeNull();
    expect(await db.query.commentReaction.findMany()).toHaveLength(0);
  });
});

test("含 contentType 的当前旧库保留 FLASH，快照可识别原有内容类型被改写", async () => {
  await withIsolatedSchema(async (client) => {
    await createLegacyFixture(client);
    // 独立复现 main 的 Prisma 结构，不借用待测增量 SQL 生成预期。
    await client.query(`CREATE TYPE "ContentType" AS ENUM ('VIDEO', 'FLASH');
      ALTER TABLE "Video" ADD COLUMN "contentType" "ContentType" NOT NULL DEFAULT 'VIDEO';
      UPDATE "Video" SET "contentType" = 'FLASH' WHERE "id" = 'fixture_video';
      INSERT INTO "Video" ("id", "title", "videoUrl", "uploaderId", "updatedAt")
      VALUES ('fixture_standard_video', '原有视频', 'https://example.invalid/standard.mp4',
        'fixture_owner', CURRENT_TIMESTAMP)`);
    const before = await snapshotLegacy(client);
    const first = await upgradeLegacyDatabase(client);
    expect(first.before).toEqual(first.after);
    assertLegacyUnchanged(before, first.after);
    const db = drizzle(client, { schema });
    expect(
      (await db.query.video.findFirst({ where: eq(schema.video.id, "fixture_video") }))
        ?.contentType,
    ).toBe("FLASH");
    await upgradeLegacyDatabase(client);
    assertLegacyUnchanged(before, await snapshotLegacy(client));
    // 数量不变的类型互换也必须被发现，摘要需要绑定业务 ID。
    await client.query(`UPDATE "Video" SET "contentType" = CASE
      WHEN "id" = 'fixture_video' THEN 'VIDEO'::"ContentType" ELSE 'FLASH'::"ContentType" END`);
    expect(() => assertLegacyUnchanged(before, first.after)).not.toThrow();
    const changed = await snapshotLegacy(client);
    expect(() => assertLegacyUnchanged(before, changed)).toThrow("Legacy data changed");
  });
});

test("auth-v1 已完成的旧库仍补内容类型，且不恢复已解绑 OAuth", async () => {
  await withIsolatedSchema(async (client) => {
    await createLegacyFixture(client);
    await upgradeLegacyDatabase(client);
    // 模拟上一版认证迁移已完成、尚未新增 Flash 列的部署状态。
    await client.query('ALTER TABLE "Video" DROP COLUMN IF EXISTS "contentType"');
    await client.query('DROP TYPE IF EXISTS "ContentType"');
    await client.query('DELETE FROM "AuthAccount" WHERE "providerId" = $1', ["github"]);
    await expect(checkDatabase(client)).rejects.toThrow("Content type migration is incomplete");
    const result = await upgradeLegacyDatabase(client);
    expect(result.alreadyApplied).toBe(true);
    expect(result.oauthAdded).toBe(0);
    const db = drizzle(client, { schema });
    expect(
      (await db.query.video.findFirst({ where: eq(schema.video.id, "fixture_video") }))
        ?.contentType,
    ).toBe("VIDEO");
    expect(
      await db.query.authAccount.findFirst({ where: eq(schema.authAccount.providerId, "github") }),
    ).toBeUndefined();
    await checkDatabase(client);
  });
});

test("首次认证失败会回滚内容类型增量及认证结构，原 209 列数据不变", async () => {
  await withIsolatedSchema(async (client) => {
    await createLegacyFixture(client);
    await client.query('UPDATE "Account" SET "provider" = $1 WHERE "id" = $2', [
      "credential",
      "fixture_github",
    ]);
    const before = await snapshotLegacy(client);
    await expect(upgradeLegacyDatabase(client)).rejects.toThrow("reserved credential");
    assertLegacyUnchanged(before, await snapshotLegacy(client));
    const { rows } = await client.query(`SELECT
      to_regclass('"AuthAccount"')::text AS "authTable",
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'Video' AND column_name = 'contentType') AS "hasContentType",
      EXISTS (SELECT 1 FROM pg_type WHERE typnamespace =
        (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
        AND typname = 'ContentType') AS "hasContentTypeEnum"`);
    expect(rows[0]).toEqual({ authTable: null, hasContentType: false, hasContentTypeEnum: false });
  });
});

test("账号归属冲突使整个升级回滚，旧数据保持不变", async () => {
  await withIsolatedSchema(async (client) => {
    await createLegacyFixture(client);
    await upgradeLegacyDatabase(client);
    // 模拟结构已创建但尚无成功标记的首次账号复制，已有目标账号归属冲突。
    await client.query('DELETE FROM "_AcgnMigration" WHERE "version" = $1', ["auth-v1"]);
    const db = drizzle(client, { schema });
    await db.delete(schema.authAccount);
    await db
      .insert(schema.authAccount)
      .values({ accountId: "external_google", providerId: "google", userId: "fixture_owner" });
    const before = await snapshotLegacy(client);
    await expect(upgradeLegacyDatabase(client)).rejects.toThrow("ownership conflict");
    expect(await db.query.authAccount.findMany()).toHaveLength(1);
    assertLegacyUnchanged(before, await snapshotLegacy(client));
    await expect(checkDatabase(client)).rejects.toThrow("migration is incomplete");
  });
});

test("超过一个批次的旧密码和 OAuth 账号都只迁移一次", async () => {
  await withIsolatedSchema(async (client) => {
    const fixture = await createLegacyFixture(client);
    await client.query(
      `INSERT INTO "User" ("id", "email", "username", "password", "updatedAt")
      SELECT 'batch_user_' || lpad(n::text, 4, '0'), 'batch_' || n || '@example.invalid',
        'batch_' || n, $1, CURRENT_TIMESTAMP FROM generate_series(1, 505) n`,
      [fixture.password],
    );
    await client.query(`INSERT INTO "Account" ("id", "userId", "type", "provider", "providerAccountId")
      SELECT 'batch_account_' || lpad(n::text, 4, '0'), 'batch_user_' || lpad(n::text, 4, '0'),
        'oauth', 'github', 'batch_external_' || n FROM generate_series(1, 505) n`);
    const first = await upgradeLegacyDatabase(client);
    expect(first.credentialsAdded).toBe(507);
    expect(first.oauthAdded).toBe(508);
    assertLegacyUnchanged(first.before, first.after);
    const second = await upgradeLegacyDatabase(client);
    expect(second.credentialsAdded).toBe(0);
    expect(second.oauthAdded).toBe(0);
    const { rows } = await client.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM "AuthAccount"',
    );
    expect(rows[0].count).toBe(1_015);
  });
}, 30_000);
