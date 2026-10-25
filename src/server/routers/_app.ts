import { adminRouter } from "./admin";
import { commentRouter } from "./comment";
import { guestbookRouter } from "./guestbook";
import { seriesRouter } from "./series";
import { tagRouter } from "./tag";
import { userRouter } from "./user";
import { videoRouter } from "./video";

export const appRouter = {
  user: userRouter,
  video: videoRouter,
  tag: tagRouter,
  admin: adminRouter,
  comment: commentRouter,
  guestbook: guestbookRouter,
  series: seriesRouter,
};

export type AppRouter = typeof appRouter;
