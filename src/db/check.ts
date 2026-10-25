import type { PoolClient } from "pg";
import { snapshotLegacy } from "./migrate";

type AuthenticationAudit = {
  accounts: number;
  sessions: number;
  verifications: number;
  migrationApplied: boolean;
  legacyCredentialsWithoutLiveAccount: number;
  legacyOAuthWithoutLiveAccount: number;
};

export async function checkDatabase(client: PoolClient, options: { legacyOnly?: boolean } = {}) {
  const businessTables = await snapshotLegacy(client);
  if (options.legacyOnly) {
    return { businessTables, authentication: "legacy schema; authentication not checked" };
  }
  const { rows: auth } = await client.query<AuthenticationAudit>(`SELECT
    (SELECT count(*)::int FROM "AuthAccount") AS accounts,
    (SELECT count(*)::int FROM "AuthSession") AS sessions,
    (SELECT count(*)::int FROM "AuthVerification") AS verifications,
    EXISTS (SELECT 1 FROM "_AcgnMigration" WHERE "version" = 'auth-v1') AS "migrationApplied",
    (SELECT count(*)::int FROM "User" u WHERE u."password" IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM "AuthAccount" a WHERE a."providerId" = 'credential' AND a."accountId" = u."id" AND a."userId" = u."id")) AS "legacyCredentialsWithoutLiveAccount",
    (SELECT count(*)::int FROM "Account" old WHERE NOT EXISTS
      (SELECT 1 FROM "AuthAccount" a WHERE a."providerId" = old."provider" AND a."accountId" = old."providerAccountId" AND a."userId" = old."userId")) AS "legacyOAuthWithoutLiveAccount"`);
  if (!auth[0].migrationApplied) {
    throw new Error("Authentication migration is incomplete; use db:upgrade explicitly");
  }
  // 切换后主动解绑/删除认证账号是合法差异，旧映射缺席只作为对账信息，不要求回灌。
  return { businessTables, authentication: auth[0] };
}
