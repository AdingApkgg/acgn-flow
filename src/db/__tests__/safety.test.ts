import { expect, test } from "bun:test";
import { assertWriteDatabaseConfirmed, requireTestDatabaseUrl } from "../safety";

test("迁移测试只接受显式专用 PostgreSQL 测试库", () => {
  for (const value of [
    undefined,
    "",
    "postgresql://user:secret@host/acgn_flow",
    "postgresql://user:secret@host/contest",
    "file:///acgn_test",
  ]) {
    expect(() => requireTestDatabaseUrl(value)).toThrow();
  }
  for (const name of ["acgn_flow_test", "acgn_flow_fixture", "test_acgn", "acgn_test_run"]) {
    const url = `postgresql://user:secret@127.0.0.1/${name}`;
    expect(requireTestDatabaseUrl(url)).toBe(url);
  }
});

test("写入确认必须匹配实际连接的数据库全名", () => {
  expect(() => assertWriteDatabaseConfirmed("acgn_flow_test", [])).toThrow();
  expect(() =>
    assertWriteDatabaseConfirmed("acgn_flow_test", ["--confirm-database=acgn_flow"]),
  ).toThrow();
  expect(() =>
    assertWriteDatabaseConfirmed("acgn_flow_test", ["--confirm-database=acgn_flow_test_extra"]),
  ).toThrow();
  expect(() =>
    assertWriteDatabaseConfirmed("acgn_flow_test", ["--confirm-database=acgn_flow_test"]),
  ).not.toThrow();
});
