export function parseSubtitle(
  content: string,
  url: string,
): Array<{ start: number; end: number; text: string }> {
  const cues: Array<{ start: number; end: number; text: string }> = [];
  const ext = url.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();

  const parseTime = (timeStr: string): number => {
    const match = timeStr.match(/(\d+):(\d+):(\d+)[.,](\d+)/);
    if (match) {
      const [, h, m, s, ms] = match;
      return parseInt(h) * 3600 + parseInt(m) * 60 + Number(`${s}.${ms}`);
    }
    const shortMatch = timeStr.match(/(\d+):(\d+)[.,](\d+)/);
    if (shortMatch) {
      const [, m, s, ms] = shortMatch;
      return parseInt(m) * 60 + Number(`${s}.${ms}`);
    }
    return 0;
  };

  if (ext === "vtt" || content.includes("WEBVTT")) {
    const lines = content.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line.includes("-->")) {
        const [startStr, endStr] = line.split("-->").map((s) => s.trim());
        const start = parseTime(startStr);
        const end = parseTime(endStr);
        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== "") {
          textLines.push(lines[i].trim());
          i++;
        }
        if (textLines.length > 0) {
          cues.push({ start, end, text: textLines.join("\n") });
        }
      }
      i++;
    }
  } else if (ext === "srt") {
    const blocks = content.split(/\r?\n\r?\n/);
    for (const block of blocks) {
      const lines = block.trim().split(/\r?\n/);
      if (lines.length >= 3) {
        const timeLine = lines[1];
        if (timeLine.includes("-->")) {
          const [startStr, endStr] = timeLine.split("-->").map((s) => s.trim());
          const start = parseTime(startStr);
          const end = parseTime(endStr);
          const text = lines.slice(2).join("\n");
          cues.push({ start, end, text });
        }
      }
    }
  } else if (ext === "ass" || ext === "ssa") {
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith("Dialogue:")) {
        const parts = line.substring(9).split(",");
        if (parts.length >= 10) {
          const startStr = parts[1].trim();
          const endStr = parts[2].trim();
          const parseAssTime = (t: string): number => {
            const m = t.match(/(\d+):(\d+):(\d+)\.(\d+)/);
            if (m) {
              return (
                parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + Number(`0.${m[4]}`)
              );
            }
            return 0;
          };
          const start = parseAssTime(startStr);
          const end = parseAssTime(endStr);
          const text = parts
            .slice(9)
            .join(",")
            .replace(/\{[^}]*\}/g, "")
            .replace(/\\[Nn]/g, "\n")
            .trim();
          if (text) {
            cues.push({ start, end, text });
          }
        }
      }
    }
  }

  return cues.sort((a, b) => a.start - b.start);
}

/** 只提取字幕文本；渲染交给 React 转义，外部标签无法注入 DOM。 */
export function subtitlePlainText(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name: string) => entities[name]);
}
