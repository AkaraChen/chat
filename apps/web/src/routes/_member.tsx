import { createFileRoute, Outlet } from "@tanstack/react-router";

import { requireMember } from "../session";

// Everything past sign-in: connecting providers and the chat itself.
export const Route = createFileRoute("/_member")({
  beforeLoad: () => requireMember(),
  component: Outlet,
});
