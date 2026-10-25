import { describe, expect, test } from "bun:test";
import { isSafeMediaUrl, mediaUrlSchema } from "../src/lib/media-url";

describe("媒体地址边界", () => {
  test("允许 HTTP(S)、上传资源和同源 B 站接口", () => {
    for (const value of [
      "https://example.test/movie.mp4",
      "http://example.test/movie.swf",
      "/uploads/flash/fixture.swf",
      "/uploads/subtitle/fixture.vtt",
      "/uploads/danmaku/fixture.json",
      "/api/bili/BV1xx411c7mD?p=2",
      "/api/bilibili/image?url=https%3A%2F%2Fi0.hdslb.com%2Fcover.jpg",
    ]) {
      expect(isSafeMediaUrl(value)).toBe(true);
      expect(mediaUrlSchema.safeParse(value).success).toBe(true);
    }
  });

  test("拒绝跨源协议相对地址、脚本、反斜线和编码路径穿越", () => {
    for (const value of [
      "",
      "//evil.example.test/movie.swf",
      "/%2fevil.example.test/movie.swf",
      "javascript:alert(1)",
      "data:text/html,attack",
      "ftp://example.test/movie.swf",
      "https:example.test/movie.mp4",
      "https://user:pass@example.test/movie.mp4",
      "/\\evil.example.test/movie.swf",
      "/%5cevil.example.test/movie.swf",
      "/uploads/../private.txt",
      "/uploads/%2e%2e/private.txt",
      "/uploads/%00file.swf",
      "/uploads/file\n.swf",
      " /uploads/file.swf",
      "relative/file.mp4",
    ]) {
      expect(isSafeMediaUrl(value)).toBe(false);
      expect(mediaUrlSchema.safeParse(value).success).toBe(false);
    }
  });
});
