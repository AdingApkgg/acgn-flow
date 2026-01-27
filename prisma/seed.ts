import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

// 动态导入生成的 Prisma Client
async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client.js");
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  
  console.log("Seeding database...");

  try {
    // 清理旧的标签（重新创建）
    console.log("Cleaning old tags...");
    await prisma.tagOnVideo.deleteMany({});
    await prisma.tag.deleteMany({});

    // 创建标签 - 题材/风格标签
    const tags = [
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
    ];

    for (const tag of tags) {
      await prisma.tag.upsert({
        where: { slug: tag.slug },
        update: {},
        create: tag,
      });
    }
    console.log(`Created ${tags.length} tags`);

    console.log("Seeding completed!");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
