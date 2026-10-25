import { describe, expect, test } from "bun:test";
import { publicRequest } from "../src/server/public-request";

describe("隧道公网请求归一", () => {
  test("恢复配置主机的HTTPS，保留POST正文、Cookie和查询", async () => {
    const request = new Request("http://af.saop.cc/api/rpc/video/update?q=1%202", {
      method: "POST",
      headers: { origin: "https://af.saop.cc", cookie: "fixture=value" },
      body: '{"title":"fixture"}',
    });
    const result = publicRequest(request, "https://af.saop.cc");
    expect(result.url).toBe("https://af.saop.cc/api/rpc/video/update?q=1%202");
    expect(result.method).toBe("POST");
    expect(result.headers.get("origin")).toBe("https://af.saop.cc");
    expect(result.headers.get("cookie")).toBe("fixture=value");
    expect(await result.text()).toBe('{"title":"fixture"}');
  });
  test("不相信其他Host的转发头，回环预览保持原请求", () => {
    const request = new Request("http://127.0.0.1:31270/flash-frame", {
      headers: { "x-forwarded-host": "af.saop.cc", "x-forwarded-proto": "https" },
    });
    expect(publicRequest(request, "https://af.saop.cc")).toBe(request);
  });
  test("同协议或未配置公开域名时不复制请求", () => {
    const request = new Request("http://localhost:3000/");
    expect(publicRequest(request, "http://localhost:3000")).toBe(request);
    expect(publicRequest(request, undefined)).toBe(request);
  });
});
