import { createFileRoute, redirect } from "@tanstack/react-router";

// Connecting a provider lives in the settings dialog now.
export const Route = createFileRoute("/_member/connect/$")({
  beforeLoad: () => {
    throw redirect({ to: "/chat", search: { settings: "providers" } });
  },
});
