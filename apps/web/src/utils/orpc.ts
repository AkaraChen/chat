import { appRouter } from "@my-better-t-app/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createRouterClient } from "@orpc/server";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { toast } from "sonner";

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Queries that show their own failure inline opt out of the toast.
        if (query.meta?.quiet) return;
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });
}

function browserClient(): RouterClient<typeof appRouter> {
  const link = new RPCLink({
    url: `${window.location.origin}/api/rpc`,
  });
  return createORPCClient(link);
}

const getORPCClient = createIsomorphicFn()
  .server(() =>
    createRouterClient(appRouter, {
      context: async () => {
        // Loaded on a request, so importing this module does not boot the database.
        const [{ createContext }, { getRequest }] = await Promise.all([
          import("../context"),
          import("@tanstack/react-start/server"),
        ]);
        return createContext({ req: getRequest() });
      },
    }),
  )
  .client(browserClient);

// The Start compiler keeps one branch. Uncompiled runs with a window (the render
// tests) use the browser client and do not boot the database.
export const client: RouterClient<typeof appRouter> =
  typeof window === "undefined" ? getORPCClient() : browserClient();

export const orpc = createTanstackQueryUtils(client);
