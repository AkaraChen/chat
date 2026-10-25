import { createFileRoute } from "@tanstack/react-router";

import { ChatShell } from "../components/chat/chat-shell";
import { settingsTabs, type SettingsTab } from "../components/chat/settings/tabs";

// Checked by hand, not with zod: route files load with the app's entry, and
// zod would make every page, the public welcome too, download it.
function validateSearch(search: Record<string, unknown>): {
  thread?: string;
  settings?: SettingsTab;
} {
  const { thread, settings } = search;
  return {
    thread: typeof thread === "string" && thread.length > 0 ? thread : undefined,
    settings: settingsTabs.find((tab) => tab === settings),
  };
}

export const Route = createFileRoute("/_member/chat")({
  validateSearch,
  component: Chat,
});

function Chat() {
  const { name, email, role } = Route.useRouteContext();
  const { thread, settings } = Route.useSearch();
  return <ChatShell name={name} email={email} role={role} thread={thread} settings={settings} />;
}
