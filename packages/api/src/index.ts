import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

// Admins and users. Credentials are the instance's, so a visitor or a signed
// out request never reaches them.
export const memberProcedure = o.use(({ context, next }) => {
  if (!context.session) throw new ORPCError("UNAUTHORIZED");
  if (context.session.role === "visitor") throw new ORPCError("FORBIDDEN");
  return next({ context: { session: context.session } });
});
