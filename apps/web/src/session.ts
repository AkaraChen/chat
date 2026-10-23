import { getRequest } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";

import { auth } from "./auth";

export type Role = "admin" | "user" | "visitor";

// A loader runs on the server, so this is the one place a route may read the
// session. The page component itself must not import it.
export async function session(): Promise<{ role: Role } | null> {
  const result = await auth.api.getSession({ headers: getRequest().headers });
  if (!result) return null;
  const role = result.user.role;
  return { role: role === "admin" || role === "user" ? role : "visitor" };
}

// `member` is the app itself: an admin or a user. A visitor, and anyone not
// signed in, goes to the public pages.
export async function gate(access: "member") {
  const current = await session();
  if (!current) throw redirect({ to: "/sign-in" });
  if (access === "member" && current.role === "visitor") throw redirect({ to: "/" });
  return current;
}
