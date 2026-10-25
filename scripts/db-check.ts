import { checkDatabase } from "../src/db/check";
import { runDatabaseCommand } from "./db-cli";

await runDatabaseCommand(async (client) => {
  await client.query("BEGIN READ ONLY");
  try {
    const result = await checkDatabase(client, { legacyOnly: process.argv.includes("--legacy") });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
});
