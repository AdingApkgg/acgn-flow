import { router } from "../trpc";
import { userRouter } from "./user";
import { videoRouter } from "./video";
import { tagRouter } from "./tag";
import { adminRouter } from "./admin";
import { commentRouter } from "./comment";
import { guestbookRouter } from "./guestbook";
import { seriesRouter } from "./series";

export const appRouter = router({
  user: userRouter,
  video: videoRouter,
  tag: tagRouter,
  admin: adminRouter,
  comment: commentRouter,
  guestbook: guestbookRouter,
  series: seriesRouter,
});

export type AppRouter = typeof appRouter;
