import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { appRouter } from "@/server/routers/_app";

const link = new RPCLink({
  url: () =>
    new URL(
      "/api/rpc",
      typeof window === "undefined"
        ? import.meta.env.VITE_APP_URL || "http://localhost:1270"
        : window.location.origin,
    ),
  fetch: (request, init) => fetch(request, { ...init, credentials: "same-origin" }),
});

export const rpc: RouterClient<typeof appRouter> = createORPCClient(link);
export const orpc = createTanstackQueryUtils(rpc);
