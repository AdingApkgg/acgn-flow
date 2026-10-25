import { describe, expect, test } from "bun:test";
import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { cursorCondition, escapeLike, requiredRow } from "../query";

const dialect = new PgDialect();
const db = drizzle.mock({ schema });

describe("业务 SQL 游标与关联查询", () => {
  test("LIKE 搜索将用户输入的通配符当作字面量", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });

  test("游标包含边界，且相同时间使用 ID 保证稳定次序", () => {
    const condition = cursorCondition(schema.video, "cursor-id", [
      { column: schema.video.createdAt, direction: "desc" },
    ]);
    expect(condition).toBeDefined();
    const query = dialect.sqlToQuery(condition ?? sql`true`);
    expect(query.sql).toContain('"Video"."createdAt" <');
    expect(query.sql).toContain('"Video"."id" <=');
    expect(query.sql).toContain('"cursor_row"."createdAt"');
    expect(query.sql).toContain('"cursor_row"."id"');
    expect(query.params.every((value) => value === "cursor-id")).toBe(true);
  });

  test("关联查询重命名外表时保留游标内部表与列的作用域", () => {
    const query = db.query.video
      .findMany({
        where: and(
          eq(schema.video.status, "PUBLISHED"),
          cursorCondition(schema.video, "cursor-id", [
            { column: schema.video.createdAt, direction: "desc" },
          ]),
        ),
        orderBy: [desc(schema.video.createdAt), desc(schema.video.id)],
        limit: 2,
      })
      .toSQL();
    expect(query.sql).toContain('"video"."createdAt"');
    expect(query.sql).toContain('"cursor_row"."createdAt"');
    expect(query.sql).toContain('"cursor_row"."id"');
    expect(query.params).toContain("PUBLISHED");
    expect(query.params).toContain("cursor-id");
  });

  test("无关联 join 的计数子查询保留外层列限定名", () => {
    const query = db.query.user
      .findFirst({
        columns: { id: true },
        extras: (row) => ({
          _count:
            sql`json_build_object('videos', (select count(*)::int from "Video" as "count_videos" where "count_videos"."uploaderId" = ${sql`${row.id}`}))`.as(
              "_count",
            ),
        }),
      })
      .toSQL();
    expect(query.sql).toContain('"count_videos"."uploaderId" = "user"."id"');
  });

  test("找不到写入结果时返回 NOT_FOUND", () => {
    expect(() => requiredRow([])).toThrow("记录不存在");
    expect(() => requiredRow(undefined)).toThrow("记录不存在");
    expect(requiredRow([{ id: "one" }])).toEqual({ id: "one" });
  });
});
