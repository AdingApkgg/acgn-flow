import { upgradeLegacyDatabase } from "../src/db/migrate";
import { runDatabaseCommand } from "./db-cli";

await runDatabaseCommand(upgradeLegacyDatabase, { write: true });
