export type MediaSourceKind =
  | "video"
  | "hls"
  | "dash"
  | "mux"
  | "youtube"
  | "vimeo"
  | "twitch"
  | "tiktok"
  | "wistia"
  | "spotify";

/** 旧播放器接受的两种 YouTube 地址转换为官方适配器可解析的等价地址。 */
export function mediaPlaybackUrl(source: string): string {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return source;
  }
  const host = url.hostname.toLowerCase();
  let changed = false;
  if (host === "youtubeeducation.com" || host === "www.youtubeeducation.com") {
    url.hostname = "www.youtube.com";
    changed = true;
  }
  if (mediaSourceKind(source) === "youtube") {
    const watch = url.pathname.match(/^\/watch\/([\w-]{11})\/?$/);
    if (watch) {
      url.pathname = "/watch";
      url.searchParams.set("v", watch[1]);
      changed = true;
    }
  }
  // 未转换的签名直链必须逐字保留，避免URL重序列化改变服务端验签。
  return changed ? url.href : source;
}

/** 按来源域名选择真正的播放适配器，不把外部网站 HTML 当作视频文件。 */
export function mediaSourceKind(source: string): MediaSourceKind {
  let url: URL;
  try {
    url = new URL(source, "https://media.invalid");
  } catch {
    return "video";
  }
  const host = url.hostname.toLowerCase();
  const matchesDomain = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  // 托管服务也提供直链，不能仅凭域名把 MP4/音频误分为嵌入页面。
  if (
    /\.(?:mp4|og[gv]|webm|mov|m4v|m4a|m4b|mp4a|mpga|mp2|mp2a|mp3|m2a|m3a|wav|weba|aac|oga|spx)$/i.test(
      url.pathname,
    )
  )
    return "video";
  if (/\.m3u8$/i.test(url.pathname)) return "hls";
  if (/\.mpd$/i.test(url.pathname)) return "dash";
  if (
    matchesDomain("youtube.com") ||
    matchesDomain("youtube-nocookie.com") ||
    matchesDomain("youtubeeducation.com") ||
    host === "youtu.be"
  )
    return "youtube";
  if (matchesDomain("vimeo.com")) return "vimeo";
  if (matchesDomain("twitch.tv")) return "twitch";
  if (matchesDomain("tiktok.com")) return "tiktok";
  if (matchesDomain("wistia.com") || matchesDomain("wistia.net") || matchesDomain("wi.st"))
    return "wistia";
  if (host === "open.spotify.com" || url.protocol === "spotify:") return "spotify";
  if (host === "stream.mux.com") return "mux";
  return "video";
}
