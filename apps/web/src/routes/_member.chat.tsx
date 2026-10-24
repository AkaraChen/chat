import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ChatShell } from "../components/chat/chat-shell";

const searchSchema = z.object({
  thread: z.string().min(1).optional().catch(undefined),
  settings: z.enum(["general", "providers", "appearance", "github"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_member/chat")({
  validateSearch: searchSchema,
  component: Chat,
});

function Chat() {
  const { name, email, role } = Route.useRouteContext();
  const { thread, settings } = Route.useSearch();
  return <ChatShell name={name} email={email} role={role} thread={thread} settings={settings} />;
}
