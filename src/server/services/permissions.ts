import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { user } from "@/db/schema";
import type { AdminScope } from "@/lib/constants";

export async function hasAdminScope(
  database: Pick<Database, "query">,
  userId: string,
  scope: AdminScope,
): Promise<boolean> {
  const current = await database.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { role: true, adminScopes: true, isBanned: true },
  });
  if (!current || current.isBanned) return false;
  if (current.role === "OWNER") return true;
  return (
    current.role === "ADMIN" &&
    Array.isArray(current.adminScopes) &&
    current.adminScopes.includes(scope)
  );
}

export async function assertAdminScope(
  database: Pick<Database, "query">,
  userId: string,
  scope: AdminScope,
): Promise<void> {
  if (!(await hasAdminScope(database, userId, scope))) {
    throw new ORPCError("FORBIDDEN", { message: "无此管理操作的权限" });
  }
}
