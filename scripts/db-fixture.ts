import { createLegacyFixture } from "../src/db/__tests__/fixture";
import { runDatabaseCommand } from "./db-cli";

await runDatabaseCommand(
  async (client) => {
    const result = await createLegacyFixture(client);
    // 不在日志中打印口令或哈希。
    return { users: result.users, credentials: result.credentials, oauth: result.oauth };
  },
  { write: true, fixture: true },
);
