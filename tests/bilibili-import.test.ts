import { describe, expect, test } from "bun:test";
import { collectDanmakuSaveTargets } from "../src/components/video/bilibili-import-results";

describe("B站批量导入弹幕映射", () => {
  test("同BV多个分P绑定各自实际创建ID与CID，不通过BV重新查找", () => {
    const results = [
      {
        success: true,
        id: "av123_p2",
        video: { customId: "av123_p2", bvid: "BV1xx411c7mD", page: 2, cid: 202, duration: 40 },
      },
      {
        success: true,
        id: "av123_p1",
        video: { customId: "av123_p1", bvid: "BV1xx411c7mD", page: 1, cid: 101, duration: 30 },
      },
    ];
    expect(collectDanmakuSaveTargets(results)).toEqual([
      { videoId: "av123_p2", bvid: "BV1xx411c7mD", cid: 202, duration: 40 },
      { videoId: "av123_p1", bvid: "BV1xx411c7mD", cid: 101, duration: 30 },
    ]);
  });

  test("失败、缺少实际ID和没有B站来源的项都不产生保存请求", () => {
    const video = { customId: "caller-requested-id", aid: 123, bvid: "BV1xx411c7mD", cid: 101 };
    expect(
      collectDanmakuSaveTargets([
        { success: false, id: "not-created", video },
        { success: false, video },
        { success: true, video },
        { success: true, id: "", video },
        {
          success: true,
          id: "created-no-source",
          video: { customId: "untrusted-fallback", aid: 456 },
        },
      ]),
    ).toEqual([]);
  });

  test("保存目标以服务端返回ID为准，不猜测customId或av号", () => {
    expect(
      collectDanmakuSaveTargets([
        {
          success: true,
          id: "server-confirmed-id",
          video: { customId: "input-custom-id", aid: 123, bvid: "BV1xx411c7mD", cid: 101 },
        },
      ]),
    ).toEqual([
      { videoId: "server-confirmed-id", bvid: "BV1xx411c7mD", cid: 101, duration: undefined },
    ]);
  });
});
