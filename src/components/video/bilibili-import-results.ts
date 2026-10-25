export interface BilibiliImportSource {
  customId?: string;
  aid?: number;
  bvid?: string;
  cid?: number;
  page?: number;
  duration?: number;
}

export interface BilibiliImportResult<T extends BilibiliImportSource = BilibiliImportSource> {
  success: boolean;
  id?: string;
  video: T;
}

// 每个创建结果携带原始自定义 ID / 分P来源，避免同 BV 多P重新匹配到错误 CID。
export function collectDanmakuSaveTargets(results: readonly BilibiliImportResult[]) {
  return results.flatMap((result) => {
    if (!result.success || !result.id || (!result.video.cid && !result.video.bvid)) return [];
    return [
      {
        videoId: result.id,
        cid: result.video.cid,
        bvid: result.video.bvid,
        duration: result.video.duration,
      },
    ];
  });
}
