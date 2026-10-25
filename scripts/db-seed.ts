import { seedTags } from "../src/db/seed";
import { runDatabaseCommand } from "./db-cli";

await runDatabaseCommand(seedTags, { write: true });
