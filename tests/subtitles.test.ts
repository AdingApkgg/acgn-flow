import { describe, expect, test } from "bun:test";
import { parseSubtitle, subtitlePlainText } from "../src/lib/subtitles";

describe("播放器字幕兼容", () => {
  test("VTT 小数按秒解释，并保留多行", () => {
    const cues = parseSubtitle(
      "WEBVTT\n\n00:01.12 --> 00:02.345\n第一行\n第二行\n",
      "https://example.test/sub.vtt",
    );
    expect(cues).toEqual([{ start: 1.12, end: 2.345, text: "第一行\n第二行" }]);
  });
  test("带签名查询参数的 SRT 可正确识别", () => {
    expect(
      parseSubtitle(
        "1\n00:00:01,000 --> 00:00:02,500\n字幕",
        "https://example.test/sub.srt?token=fixture",
      )[0],
    ).toEqual({ start: 1, end: 2.5, text: "字幕" });
  });
  test("ASS 样式控制不作为HTML执行，换行继续工作", () => {
    const cues = parseSubtitle(
      "Dialogue: 0,0:00:01.25,0:00:02.50,Default,,0,0,0,,{\\b1}第一行\\N第二行",
      "https://example.test/sub.ass",
    );
    expect(cues[0]).toEqual({ start: 1.25, end: 2.5, text: "第一行\n第二行" });
  });
  test("外部字幕标签只提取文本，实体不会变成可执行HTML", () => {
    expect(subtitlePlainText('<img src=x onerror="alert(1)"><b>字幕</b> &lt;安全&gt;')).toBe(
      "字幕 <安全>",
    );
  });
});
