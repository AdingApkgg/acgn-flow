import { nanoid } from "nanoid";
import type { PoolClient } from "pg";

export const defaultTags = [
  // 题材类型
  { name: "热血", slug: "action" },
  { name: "恋爱", slug: "romance" },
  { name: "后宫", slug: "harem" },
  { name: "冒险", slug: "adventure" },
  { name: "奇幻", slug: "fantasy" },
  { name: "异世界", slug: "isekai" },
  { name: "校园", slug: "school" },
  { name: "搞笑", slug: "comedy" },
  { name: "日常", slug: "slice-of-life" },
  { name: "科幻", slug: "sci-fi" },
  { name: "机战", slug: "mecha" },
  { name: "悬疑", slug: "mystery" },
  { name: "恐怖", slug: "horror" },
  { name: "治愈", slug: "healing" },
  { name: "运动", slug: "sports" },
  { name: "音乐", slug: "music-genre" },
  { name: "偶像", slug: "idol" },
  { name: "百合", slug: "yuri" },
  { name: "耽美", slug: "bl" },
  { name: "战斗", slug: "battle" },
  // 来源
  { name: "日本", slug: "japan" },
  { name: "国创", slug: "chinese" },
  { name: "欧美", slug: "western" },
  { name: "韩国", slug: "korean" },
  // 受众
  { name: "少年向", slug: "shounen" },
  { name: "少女向", slug: "shoujo" },
  { name: "青年向", slug: "seinen" },
  { name: "女性向", slug: "josei" },
  { name: "子供向", slug: "kids" },
  // 其他
  { name: "经典", slug: "classic" },
  { name: "新番", slug: "new-release" },
  { name: "原创", slug: "original" },
  { name: "漫改", slug: "manga-adapted" },
  { name: "轻改", slug: "novel-adapted" },
  { name: "游戏改", slug: "game-adapted" },
] as const;

/** 只补缺少的标签，保留现有名称、ID、视频关联和所有用户内容。 */
export async function seedTags(client: PoolClient) {
  await client.query("BEGIN");
  try {
    let added = 0;
    for (const tag of defaultTags) {
      const result = await client.query(
        'INSERT INTO "Tag" ("id", "name", "slug") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [nanoid(), tag.name, tag.slug],
      );
      added += result.rowCount ?? 0;
    }
    await client.query("COMMIT");
    return { added, requested: defaultTags.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
