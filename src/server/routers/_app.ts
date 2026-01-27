import { router } from "../trpc";
import { userRouter } from "./user";
import { videoRouter } from "./video";
import { categoryRouter } from "./category";
import { tagRouter } from "./tag";

export const appRouter = router({
  user: userRouter,
  video: videoRouter,
  category: categoryRouter,
  tag: tagRouter,
});

export type AppRouter = typeof appRouter;
