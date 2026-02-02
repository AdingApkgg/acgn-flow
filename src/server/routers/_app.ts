import { router } from "../trpc";
import { userRouter } from "./user";
import { videoRouter } from "./video";
import { tagRouter } from "./tag";
import { adminRouter } from "./admin";
import { commentRouter } from "./comment";
import { guestbookRouter } from "./guestbook";

export const appRouter = router({
  user: userRouter,
  video: videoRouter,
  tag: tagRouter,
  admin: adminRouter,
  comment: commentRouter,
  guestbook: guestbookRouter,
});

export type AppRouter = typeof appRouter;
