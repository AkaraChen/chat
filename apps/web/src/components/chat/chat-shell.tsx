import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { toast } from "sonner";

import { client, orpc } from "@/utils/orpc";

import { EmptyPane } from "./empty-pane";
import { ModelPicker } from "./model-picker";
import { SettingsDialog, type SettingsTab } from "./settings/settings-dialog";
import { Sidebar } from "./sidebar";
import { ThreadPane, type Pending } from "./thread-pane";

const TITLE_POLL_MS = 2000;
// Give up waiting for a title after this long, in case the worker is down.
const TITLE_WAIT_MS = 5 * 60 * 1000;

export function ChatShell({
  name,
  thread,
  settings,
}: {
  name: string;
  thread: string | undefined;
  settings: SettingsTab | undefined;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pending = useRef<Pending | null>(null);

  // The newest thread keeps its cut-off title until the background task has
  // summarised it, so ask again every 2 seconds until it has.
  const threads = useQuery(
    orpc.threads.list.queryOptions({
      refetchInterval: (query) => {
        const newest = query.state.data?.[0];
        if (!newest || newest.titledAt) return false;
        return Date.now() - new Date(newest.createdAt).getTime() < TITLE_WAIT_MS
          ? TITLE_POLL_MS
          : false;
      },
    }),
  );

  async function start(text: string) {
    try {
      const created = await client.threads.create({ text });
      pending.current = { threadId: created.id, text };
      await queryClient.invalidateQueries({ queryKey: orpc.threads.list.key() });
      await navigate({ to: "/chat", search: { thread: created.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start the conversation.");
      throw error;
    }
  }

  const openSettings = (tab: SettingsTab) =>
    navigate({ to: "/chat", search: (prev) => ({ ...prev, settings: tab }) });

  return (
    <div className="flex h-svh bg-white">
      <Sidebar
        threads={threads.data ?? []}
        activeId={thread}
        name={name}
        onSettings={() => openSettings("general")}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center px-3">
          <ModelPicker onConnect={() => openSettings("providers")} />
        </header>
        {thread ? (
          <ThreadPane
            key={thread}
            threadId={thread}
            pending={pending}
            onMissing={() => navigate({ to: "/chat", search: {}, replace: true })}
          />
        ) : (
          <EmptyPane name={name} onStart={start} />
        )}
      </main>
      <SettingsDialog
        tab={settings}
        name={name}
        onTab={openSettings}
        onClose={() =>
          navigate({ to: "/chat", search: (prev) => ({ ...prev, settings: undefined }) })
        }
      />
    </div>
  );
}
