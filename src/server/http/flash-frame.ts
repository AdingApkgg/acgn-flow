import { isSafeMediaUrl } from "@/lib/media-url";
import frameRuntime from "@/lib/ruffle-frame-runtime.js?raw";

function escapeScript(value: string) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function GET(request: Request): Response {
  const requestUrl = new URL(request.url);
  const input = requestUrl.searchParams.get("url") || "";
  if (!isSafeMediaUrl(input)) return new Response("无效的 Flash 地址", { status: 400 });
  const swf = new URL(input, requestUrl.origin);
  swf.hash = "";
  // 同站仅允许公开上传文件；不能把 API 地址选为允许联网的 SWF。
  if (
    !swf.pathname.toLowerCase().endsWith(".swf") ||
    (swf.origin === requestUrl.origin && !swf.pathname.startsWith("/uploads/")) ||
    /%2f|%5c|%2e/i.test(swf.pathname)
  )
    return new Response("Flash 仅支持公开 SWF 资源", { status: 400 });
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const assets = `${requestUrl.origin}/ruffle/`;
  // CSP 的 source 不含 query；编码分隔符，防止用户地址注入新指令。
  const source = `${swf.origin}${swf.pathname}`.replaceAll(";", "%3B").replaceAll("'", "%27");
  const csp = [
    "default-src 'none'",
    "sandbox allow-scripts",
    "frame-ancestors 'self'",
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval' ${assets}`,
    `connect-src ${assets} ${source}`,
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "media-src blob:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  const script = `${frameRuntime}\nbootFlashFrame(${escapeScript(swf.href)}, ${escapeScript(requestUrl.origin)});`;
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Flash 沙箱</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style></head><body><script type="module" nonce="${nonce}">${script}</script></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": csp,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      },
    },
  );
}
