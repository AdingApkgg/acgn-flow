import { describe, expect, test } from "bun:test";
import { mediaPlaybackUrl, mediaSourceKind } from "../src/lib/media-source";

describe("媒体源选择保留嵌入播放器能力", () => {
  test.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://youtu.be/dQw4w9WgXcQ?t=12", "youtube"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "youtube"],
    ["https://www.youtubeeducation.com/embed/dQw4w9WgXcQ", "youtube"],
    ["https://vimeo.com/123456789", "vimeo"],
    ["https://player.vimeo.com/video/123456789?h=token", "vimeo"],
    ["https://www.twitch.tv/examplechannel", "twitch"],
    ["https://www.tiktok.com/@example/video/123456789", "tiktok"],
    ["https://example.wistia.com/medias/abc123def4", "wistia"],
    ["https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl", "spotify"],
    ["https://stream.mux.com/fixture-playback-id", "mux"],
    ["https://media.example.test/movie.mpd?token=secret", "dash"],
  ] as const)("%s 不应作为原生媒体文件加载", (url, expected) => {
    expect(mediaSourceKind(url)).toBe(expected);
  });

  test.each([
    ["https://media.example.test/movie.m3u8?token=secret#fragment", "hls"],
    ["https://media.example.test/movie.M3U8", "hls"],
    ["https://stream.mux.com/fixture-playback-id.m3u8", "hls"],
    ["https://media.example.test/movie.mp4", "video"],
    ["https://stream.mux.com/fixture/high.mp4", "video"],
    ["https://stream.mux.com/fixture/audio.m4a", "video"],
    ["https://player.vimeo.com/progressive_redirect/12345.mp4", "video"],
    ["https://player.vimeo.com/external/12345.m3u8?token=fixture", "hls"],
    ["/uploads/movie.webm", "video"],
    ["https://youtube.com.example.test/movie.mp4", "video"],
    ["https://example.test/movie.mp4?next=https://youtube.com/watch?v=abc", "video"],
  ] as const)("%s 保持正确媒体类型与域名边界", (url, expected) => {
    expect(mediaSourceKind(url)).toBe(expected);
  });

  test("旧 YouTube 教育域与 watch 路径转换后能交给官方适配器", () => {
    expect(mediaPlaybackUrl("https://www.youtubeeducation.com/embed/dQw4w9WgXcQ?t=12")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ?t=12",
    );
    expect(mediaPlaybackUrl("https://www.youtube.com/watch/dQw4w9WgXcQ?t=12")).toBe(
      "https://www.youtube.com/watch?t=12&v=dQw4w9WgXcQ",
    );
    expect(mediaPlaybackUrl("https://media.example.test/video.mp4?signature=keep%2Bexact")).toBe(
      "https://media.example.test/video.mp4?signature=keep%2Bexact",
    );
  });
});
