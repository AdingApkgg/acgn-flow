import { Pool, type PoolClient } from "pg";
import { assertWriteDatabaseConfirmed, requireTestDatabaseUrl } from "../src/db/safety";

export async function runDatabaseCommand(
  action: (client: PoolClient) => Promise<unknown>,
  options: { write?: boolean; fixture?: boolean } = {},
) {
  const connectionString = options.fixture
    ? requireTestDatabaseUrl(process.env.TEST_DATABASE_URL)
    : process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query<{ database: string }>(
        "SELECT current_database() AS database",
      );
      const database = rows[0].database;
      if (options.write) assertWriteDatabaseConfirmed(database, process.argv);
      // 运维入口只管理 public；集成测试直接使用独立临时 schema。
      await client.query("SET search_path TO public");
      const result = await action(client);
      console.log(JSON.stringify({ database, result }, null, 2));
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
