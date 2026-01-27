import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../trpc";
import { getCache, setCache, deleteCache } from "@/lib/redis";

const CATEGORY_CACHE_KEY = "categories:all";
const CATEGORY_CACHE_TTL = 3600; // 1 hour

export const categoryRouter = router({
  // 获取所有分类
  list: publicProcedure.query(async ({ ctx }) => {
    const cached = await getCache<typeof categories>(CATEGORY_CACHE_KEY);
    if (cached) return cached;

    const categories = await ctx.prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { videos: true } },
      },
    });

    await setCache(CATEGORY_CACHE_KEY, categories, CATEGORY_CACHE_TTL);
    return categories;
  }),

  // 根据 slug 获取分类
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const category = await ctx.prisma.category.findUnique({
        where: { slug: input.slug },
        include: {
          _count: { select: { videos: true } },
        },
      });

      return category;
    }),

  // 创建分类
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        slug: z.string().min(1).max(50),
        description: z.string().max(200).optional(),
        icon: z.string().optional(),
        sortOrder: z.number().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const category = await ctx.prisma.category.create({
        data: input,
      });

      await deleteCache(CATEGORY_CACHE_KEY);
      return category;
    }),

  // 更新分类
  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50).optional(),
        slug: z.string().min(1).max(50).optional(),
        description: z.string().max(200).optional(),
        icon: z.string().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const category = await ctx.prisma.category.update({
        where: { id },
        data,
      });

      await deleteCache(CATEGORY_CACHE_KEY);
      return category;
    }),

  // 删除分类
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.category.delete({
        where: { id: input.id },
      });

      await deleteCache(CATEGORY_CACHE_KEY);
      return { success: true };
    }),
});
