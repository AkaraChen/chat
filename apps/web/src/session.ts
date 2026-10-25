import { type Role, toRole } from "@my-better-t-app/db/auth";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { auth } from "./auth";

// `beforeLoad` and loaders also run in the browser, so the session is read
// through a server function. The handler, and with it Better Auth and Prisma,
// stays out of the client bundle.
export const getSession = createServerFn().handler(
  async (): Promise<{ userId: string; role: Role; name: string; email: string } | null> => {
    const result = await auth.api.getSession({ headers: getRequest().headers });
    return result
      ? {
          userId: result.user.id,
          role: toRole(result.user.role),
          name: result.user.name,
          email: result.user.email,
        }
      : null;
  },
);

// `beforeLoad` runs on every navigation, including a search change such as
// opening a thread. Caching the session saves a round trip each time; the
// server still checks it on every request, and signing out clears the cache.
const sessionQuery = {
  queryKey: ["session"],
  queryFn: () => getSession(),
  staleTime: 5 * 60 * 1000,
};

// A member is an admin or a user. A visitor, and anyone not signed in, goes to
// the public welcome.
export async function requireMember(queryClient: QueryClient) {
  const current = await queryClient.fetchQuery(sessionQuery);
  if (!current) throw redirect({ to: "/" });
  if (current.role === "visitor") throw redirect({ to: "/" });
  return current;
}
