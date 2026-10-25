import { describe, expect, spyOn, test } from "bun:test";
import { GET } from "../src/server/http/bili";
import { POST as batch } from "../src/server/http/bilibili-batch";
import { POST as parse } from "../src/server/http/bilibili-parse";

type RemoteRequest = { url: URL; init?: RequestInit };

async function withBilibili(
  respond: (request: RemoteRequest) => Response,
  run: (requests: RemoteRequest[]) => Promise<void>,
) {
  const requests: RemoteRequest[] = [];
  const mockedFetch: typeof fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = { url: new URL(input instanceof Request ? input.url : String(input)), init };
      requests.push(request);
      return respond(request);
    },
    { preconnect: globalThis.fetch.preconnect },
  );
  const network = spyOn(globalThis, "fetch").mockImplementation(mockedFetch);
  try {
    await run(requests);
  } finally {
    network.mockRestore();
  }
}

function playback(vid: string, page = "1") {
  return GET(new Request(`https://example.test/api/bili/${vid}?p=${page}`), {
    params: Promise.resolve({ vid }),
  });
}

describe("B站同源播放接口", () => {
  test("无效ID和分P在请求上游前被拒绝", () =>
    withBilibili(
      () => {
        throw new Error("无效输入不应访问上游");
      },
      async (requests) => {
        for (const vid of ["invalid", "BVbad", "av0", "av12?aid=999"])
          expect((await playback(vid)).status).toBe(400);
        for (const page of ["0", "-1", "1x", "1.5", "Infinity", "9007199254740992", ""])
          expect((await playback("BV1xx411c7mD", page)).status).toBe(400);
        expect(requests).toHaveLength(0);
      },
    ));

  test("按分P解析CID、返回MP4重定向且重复访问命中缓存", () =>
    withBilibili(
      ({ url }) =>
        url.pathname.endsWith("pagelist")
          ? Response.json({
              code: 0,
              data: [
                { page: 1, cid: 101 },
                { page: 2, cid: 202 },
              ],
            })
          : Response.json({
              code: 0,
              data: {
                quality: 80,
                durl: [{ url: "https://cdn.example.test/fixture.mp4", backup_url: [] }],
              },
            }),
      async (requests) => {
        const first = await playback("BV1xx411c7mD", "2");
        expect(first.status).toBe(307);
        expect(first.headers.get("location")).toBe("https://cdn.example.test/fixture.mp4");
        expect(first.headers.get("referrer-policy")).toBe("no-referrer");
        expect(first.headers.get("x-video-quality")).toBe("80");
        expect(requests).toHaveLength(2);
        expect(requests[1]?.url.searchParams.get("cid")).toBe("202");
        expect(requests[1]?.url.searchParams.get("platform")).toBe("html5");
        expect(requests[1]?.url.searchParams.get("type")).toBe("mp4");
        expect((await playback("BV1xx411c7mD", "2")).headers.get("x-cache")).toBe("HIT");
        expect(requests).toHaveLength(2);
        expect((await playback("BV1xx411c7mD", "1")).status).toBe(307);
        expect(requests).toHaveLength(3);
        expect(requests[2]?.url.searchParams.get("cid")).toBe("101");
      },
    ));

  test("AV使用aid/avid参数，上游取流失败后重新解析CID", () => {
    let attempts = 0;
    return withBilibili(
      ({ url }) => {
        if (url.pathname.endsWith("pagelist")) {
          expect(url.searchParams.get("aid")).toBe("170001");
          return Response.json({ code: 0, data: [{ page: 1, cid: 111 }] });
        }
        expect(url.searchParams.get("avid")).toBe("170001");
        attempts++;
        return attempts === 1
          ? Response.json({ code: -412, message: "受控风控错误" })
          : Response.json({
              code: 0,
              data: { durl: [{ url: "https://cdn.example.test/av.mp4" }] },
            });
      },
      async (requests) => {
        const first = await playback("av170001");
        expect(first.status).toBe(502);
        expect((await first.json()).error).toContain("-412");
        expect((await playback("av170001")).status).toBe(307);
        expect(requests.filter(({ url }) => url.pathname.endsWith("pagelist"))).toHaveLength(2);
      },
    );
  });

  test("不存在的分P返回上游错误，不猜测其他CID", () =>
    withBilibili(
      () => Response.json({ code: 0, data: [{ page: 1, cid: 101 }] }),
      async (requests) => {
        const response = await playback("av170002", "3");
        expect(response.status).toBe(502);
        expect((await response.json()).error).toContain("分P 3 不存在");
        expect(requests).toHaveLength(1);
      },
    ));

  test("上游返回脚本地址时拒绝重定向", () =>
    withBilibili(
      ({ url }) =>
        url.pathname.endsWith("pagelist")
          ? Response.json({ code: 0, data: [{ page: 1, cid: 101 }] })
          : Response.json({ code: 0, data: { durl: [{ url: "javascript:alert(1)" }] } }),
      async () => {
        const response = await playback("av170003");
        expect(response.status).toBe(502);
        expect(response.headers.get("location")).toBeNull();
      },
    ));
});

describe("B站导入同源地址", () => {
  const info = {
    bvid: "BV1xx411c7mD",
    aid: 170001,
    cid: 101,
    title: "受控B站夹具",
    desc: "说明",
    pic: "http://i0.hdslb.com/fixture.jpg",
    duration: 60,
    owner: { name: "夹具作者", mid: 123, face: "" },
  };

  function respond({ url }: RemoteRequest): Response {
    if (url.pathname.endsWith("/nav"))
      return Response.json({
        code: 0,
        data: {
          wbi_img: {
            img_url: `https://i0.hdslb.com/${"a".repeat(32)}.png`,
            sub_url: `https://i0.hdslb.com/${"b".repeat(32)}.png`,
          },
        },
      });
    if (url.pathname.endsWith("/tags"))
      return Response.json({ code: 0, data: [{ tag_name: "夹具标签" }] });
    if (url.pathname.endsWith("/pagelist"))
      return Response.json({
        code: 0,
        data: [
          { page: 1, cid: 101, part: "第一P", duration: 30 },
          { page: 2, cid: 202, part: "第二P", duration: 40 },
        ],
      });
    return Response.json({ code: 0, data: info });
  }

  test("单条解析返回可提交的站内视频、封面和CID", () =>
    withBilibili(respond, async () => {
      const response = await parse(
        new Request("https://example.test/api/bilibili/parse", {
          method: "POST",
          body: JSON.stringify({ url: info.bvid }),
        }),
      );
      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(data.videoUrl).toBe(`/api/bili/${info.bvid}`);
      expect(data.coverUrl).toMatch(/^\/api\/bilibili\/image\?url=https%3A/);
      expect(data.cid).toBe(101);
      expect(data.tags).toEqual(["夹具标签"]);
    }));

  test("分P导入保留page/CID和同源播放URL", () =>
    withBilibili(respond, async () => {
      const response = await batch(
        new Request("https://example.test/api/bilibili/batch", {
          method: "POST",
          body: JSON.stringify({ type: "pages", value: info.bvid }),
        }),
      );
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.isPages).toBe(true);
      expect(
        result.data.map((item: { page: number; cid: number; videoUrl: string }) => ({
          page: item.page,
          cid: item.cid,
          videoUrl: item.videoUrl,
        })),
      ).toEqual([
        { page: 1, cid: 101, videoUrl: `/api/bili/${info.bvid}?p=1` },
        { page: 2, cid: 202, videoUrl: `/api/bili/${info.bvid}?p=2` },
      ]);
    }));
});
