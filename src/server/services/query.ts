import { ORPCError } from "@orpc/server";
import {
  and,
  eq,
  getTableColumns,
  getTableName,
  gt,
  gte,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";

export function requiredRow<T>(rows: T[]): T;
export function requiredRow<T>(row: T | undefined | null): NonNullable<T>;
export function requiredRow(value: unknown): unknown {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) throw new ORPCError("NOT_FOUND", { message: "记录不存在" });
  return row;
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** 游标指向上一页取出后保留的首条记录，因此边界包含游标本身。 */
export function cursorCondition(
  table: AnyPgTable,
  cursor: string | undefined,
  order: ReadonlyArray<{ column: AnyPgColumn; direction: "asc" | "desc" }>,
): SQL | undefined {
  if (!cursor) return undefined;
  const columns = getTableColumns(table);
  const id = columns.id;
  const sequence = [...order];
  if (!sequence.some((item) => item.column.name === id.name)) {
    sequence.push({ column: id, direction: "desc" });
  }
  const cursorValue = (column: AnyPgColumn) =>
    sql`(select ${sql.identifier("cursor_row")}.${sql.identifier(column.name)} from ${sql.identifier(getTableName(table))} as ${sql.identifier("cursor_row")} where ${sql.identifier("cursor_row")}.${sql.identifier(id.name)} = ${cursor})`;
  return or(
    ...sequence.map((item, index) =>
      and(
        ...sequence
          .slice(0, index)
          .map((previous) => eq(previous.column, cursorValue(previous.column))),
        index === sequence.length - 1
          ? item.direction === "asc"
            ? gte(item.column, cursorValue(item.column))
            : lte(item.column, cursorValue(item.column))
          : item.direction === "asc"
            ? gt(item.column, cursorValue(item.column))
            : lt(item.column, cursorValue(item.column)),
      ),
    ),
  );
}
