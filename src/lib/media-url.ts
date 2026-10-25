import { z } from "zod";

function hasUnsafeCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 32 || code === 127 || character === "\\";
  });
}

/** 允许 HTTP(S) 绝对地址和站内根相对地址，拒绝协议绕过及路径穿越。 */
export function isSafeMediaUrl(value: string): boolean {
  if (!value || hasUnsafeCharacters(value)) return false;
  try {
    if (value.startsWith("/")) {
      const path = decodeURIComponent(value.split(/[?#]/, 1)[0] || "");
      if (path.startsWith("//") || hasUnsafeCharacters(path)) return false;
      if (path.split("/").some((segment) => segment === "." || segment === "..")) return false;
      return new URL(value, "https://media.invalid").origin === "https://media.invalid";
    }
    if (!/^https?:\/\//i.test(value)) return false;
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

export const mediaUrlSchema = z
  .string()
  .refine(isSafeMediaUrl, "请输入 HTTP(S) 或安全的站内媒体地址");
