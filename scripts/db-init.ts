import { initializeDatabase } from "../src/db/migrate";
import { runDatabaseCommand } from "./db-cli";

await runDatabaseCommand(initializeDatabase, { write: true });
