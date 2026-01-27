import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../trpc";

export const tagRouter = router({
  // 根据 slug 获取标签
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const tag = await ctx.prisma.tag.findUnique({
        where: { slug: input.slug },
        include: {
          _count: { select: { videos: true } },
        },
      });

      return tag;
    }),

  // 获取所有标签
  list: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const tags = await ctx.prisma.tag.findMany({
        take: input.limit,
        where: input.search
          ? {
              name: { contains: input.search, mode: "insensitive" },
            }
          : undefined,
        include: {
          _count: { select: { videos: true } },
        },
        orderBy: { name: "asc" },
      });

      return tags;
    }),

  // 热门标签
  popular: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      const tags = await ctx.prisma.tag.findMany({
        take: input.limit,
        include: {
          _count: { select: { videos: true } },
        },
        orderBy: {
          videos: { _count: "desc" },
        },
      });

      return tags;
    }),

  // 创建标签
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(30),
        slug: z.string().min(1).max(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.prisma.tag.create({
        data: input,
      });

      return tag;
    }),

  // 删除标签
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.tag.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
