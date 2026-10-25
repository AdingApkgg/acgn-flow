export function requireTestDatabaseUrl(value: string | undefined): string {
  if (!value)
    throw new Error("TEST_DATABASE_URL is required; migration tests never use DATABASE_URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a PostgreSQL URL");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/(^|_)(test|fixture)(_|$)/i.test(database)) {
    throw new Error("Migration tests require a database name containing _test or _fixture");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("PostgreSQL URL required");
  return value;
}

export function assertWriteDatabaseConfirmed(database: string, args: string[]) {
  if (!args.includes(`--confirm-database=${database}`)) {
    throw new Error(`Explicit write confirmation required: --confirm-database=${database}`);
  }
}
