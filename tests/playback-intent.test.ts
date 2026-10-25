import { describe, expect, test } from "bun:test";
import { playbackErrorStopsIntent } from "../src/lib/playback-intent";

describe("媒体播放意图", () => {
  test("切源和 seek 的 AbortError 不清除播放意图", () => {
    expect(playbackErrorStopsIntent(new DOMException("load interrupted", "AbortError"))).toBe(
      false,
    );
    expect(playbackErrorStopsIntent({ name: "AbortError" })).toBe(false);
  });
  test("自动播放拒绝和真实错误停止播放意图", () => {
    expect(playbackErrorStopsIntent(new DOMException("gesture required", "NotAllowedError"))).toBe(
      true,
    );
    expect(playbackErrorStopsIntent(new Error("unsupported media"))).toBe(true);
    expect(playbackErrorStopsIntent(null)).toBe(true);
  });
});
