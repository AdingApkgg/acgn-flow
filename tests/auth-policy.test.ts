import { describe, expect, test } from "bun:test";
import { safeCallbackPath, sessionIsUsable } from "../src/lib/auth-policy";

describe("认证迁移策略", () => {
  test("登录回跳只能到同站路径", () => {
    expect(safeCallbackPath("/settings/connections?linked=1")).toBe(
      "/settings/connections?linked=1",
    );
    for (const target of [
      "https://example.com/",
      "//example.com/",
      "/\\example.com/",
      "javascript:alert(1)",
      "",
    ]) {
      expect(safeCallbackPath(target)).toBe("/");
    }
  });

  test("封禁、过期或被撤销会话无法继续使用", () => {
    const now = new Date("2026-10-26T00:00:00Z");
    const expiresAt = new Date("2026-10-27T00:00:00Z");
    expect(sessionIsUsable({ expiresAt, isBanned: false, isRevoked: false }, now)).toBe(true);
    expect(sessionIsUsable({ expiresAt, isBanned: true, isRevoked: false }, now)).toBe(false);
    expect(sessionIsUsable({ expiresAt, isBanned: false, isRevoked: true }, now)).toBe(false);
    expect(sessionIsUsable({ expiresAt: now, isBanned: false, isRevoked: false }, now)).toBe(false);
  });
});
