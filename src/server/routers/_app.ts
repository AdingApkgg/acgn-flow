import { router } from "../trpc";
import { userRouter } from "./user";
import { videoRouter } from "./video";
import { tagRouter } from "./tag";
import { adminRouter } from "./admin";

export const appRouter = router({
  user: userRouter,
  video: videoRouter,
  tag: tagRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
