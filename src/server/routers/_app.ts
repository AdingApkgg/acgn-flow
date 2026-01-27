import { router } from "../trpc";
import { userRouter } from "./user";
import { videoRouter } from "./video";
import { tagRouter } from "./tag";

export const appRouter = router({
  user: userRouter,
  video: videoRouter,
  tag: tagRouter,
});

export type AppRouter = typeof appRouter;
