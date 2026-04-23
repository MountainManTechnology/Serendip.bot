import { router } from "../trpc.js";
import { discoveryRouter } from "./discovery.js";
import { feedbackRouter } from "./feedback.js";
import { adminRouter } from "./admin.js";

export const appRouter = router({
  discovery: discoveryRouter,
  feedback: feedbackRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
