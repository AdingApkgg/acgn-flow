import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

// 动态导入生成的 Prisma Client
async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client.js");
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  
  console.log("Seeding database...");

  try {
    // 清理旧的分类和标签（重新创建）
    console.log("Cleaning old categories and tags...");
    await prisma.tagOnVideo.deleteMany({});
    await prisma.tag.deleteMany({});
    await prisma.category.deleteMany({});

    // 创建管理员用户
    const adminPassword = await bcrypt.hash("admin123", 12);
    const admin = await prisma.user.upsert({
      where: { email: "admin@acgnflow.com" },
      update: {},
      create: {
        email: "admin@acgnflow.com",
        username: "admin",
        password: adminPassword,
        nickname: "管理员",
        role: "ADMIN",
      },
    });
    console.log(`Created admin user: ${admin.email}`);

    // 创建分类 - ACGN 四大类
    const categories = [
      // Anime 动画
      { name: "新番连载", slug: "anime-ongoing", description: "正在连载的动画", sortOrder: 1 },
      { name: "完结动画", slug: "anime-completed", description: "已完结的动画", sortOrder: 2 },
      { name: "剧场版", slug: "anime-movie", description: "动画剧场版电影", sortOrder: 3 },
      { name: "OVA/OAD", slug: "anime-ova", description: "原创动画视频", sortOrder: 4 },
      // Comic 漫画
      { name: "漫画", slug: "comic", description: "漫画相关内容", sortOrder: 10 },
      { name: "漫评", slug: "comic-review", description: "漫画评论与解说", sortOrder: 11 },
      // Game 游戏
      { name: "游戏实况", slug: "game-playthrough", description: "游戏实况录像", sortOrder: 20 },
      { name: "游戏攻略", slug: "game-guide", description: "游戏攻略视频", sortOrder: 21 },
      { name: "Galgame", slug: "galgame", description: "美少女游戏", sortOrder: 22 },
      // Novel 轻小说
      { name: "轻小说", slug: "novel", description: "轻小说有声书/解说", sortOrder: 30 },
      // 综合
      { name: "MAD/AMV", slug: "mad-amv", description: "二次创作混剪", sortOrder: 40 },
      { name: "音乐", slug: "music", description: "ACGN 音乐 MV/翻唱", sortOrder: 41 },
      { name: "资讯", slug: "news", description: "ACGN 新闻资讯", sortOrder: 42 },
      { name: "杂谈", slug: "misc", description: "其他 ACGN 相关内容", sortOrder: 50 },
    ];

    for (const cat of categories) {
      await prisma.category.upsert({
        where: { slug: cat.slug },
        update: {},
        create: cat,
      });
    }
    console.log(`Created ${categories.length} categories`);

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
