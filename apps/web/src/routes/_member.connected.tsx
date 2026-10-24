import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_member/connected")({
  beforeLoad: () => {
    throw redirect({ to: "/chat", search: { settings: "providers" } });
  },
});
