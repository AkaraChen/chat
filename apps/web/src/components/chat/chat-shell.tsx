import { DotsThreeIcon, ExportIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { toast } from "sonner";

import { client, orpc } from "@/utils/orpc";

import { EmptyPane } from "./empty-pane";
import { ModelPicker } from "./model-picker";
import { SettingsDialog, type SettingsData, type SettingsTab } from "./settings/settings-dialog";
import { Sidebar } from "./sidebar";
import { ThreadPane, type Pending } from "./thread-pane";

type ThreadList = { id: string; title: string; updatedAt: Date | string }[];

const TITLE_POLL_MS = 2000;
// Give up waiting for a title after this long, in case the worker is down.
const TITLE_WAIT_MS = 5 * 60 * 1000;

export function ChatShell({
  name,
  email,
  role,
  thread,
  settings,
  threadList,
  settingsData,
}: {
  name: string;
  email: string;
  role: string;
  thread: string | undefined;
  settings: SettingsTab | undefined;
  /** When set, the shell renders this list and does not ask the server. */
  threadList?: ThreadList;
  settingsData?: SettingsData;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pending = useRef<Pending | null>(null);

  // The newest thread keeps its cut-off title until the background task has
  // summarised it, so ask again every 2 seconds until it has.
  const threads = useQuery({
    ...orpc.threads.list.queryOptions({
      refetchInterval: (query) => {
        const newest = query.state.data?.[0];
        if (!newest || newest.titledAt) return false;
        return Date.now() - new Date(newest.createdAt).getTime() < TITLE_WAIT_MS
          ? TITLE_POLL_MS
          : false;
      },
    }),
    enabled: threadList === undefined,
  });
  const shown = threadList ?? threads.data ?? [];

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
    <div className="flex h-svh bg-[#F7F7F9] p-2">
      <Sidebar
        threads={shown}
        activeId={thread}
        name={name}
        role={role}
        onSettings={() => openSettings("general")}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-[#E3E3E7] bg-white">
        <header className="flex h-14 shrink-0 items-center justify-between px-4">
          <ModelPicker onConnect={() => openSettings("providers")} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="More"
              className="flex size-9 items-center justify-center rounded-full text-[#6E6E73] hover:bg-[#F7F7F9]"
            >
              <DotsThreeIcon size={18} weight="bold" />
            </button>
            <button
              type="button"
              className="flex h-9 items-center gap-1.5 rounded-full border border-[#DCDCE0] px-3 text-sm font-medium text-[#1C1C1E] hover:bg-[#F7F7F9]"
            >
              <ExportIcon size={14} />
              Export chat
            </button>
          </div>
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
        email={email}
        onTab={openSettings}
        onClose={() =>
          navigate({ to: "/chat", search: (prev) => ({ ...prev, settings: undefined }) })
        }
        data={settingsData}
      />
    </div>
  );
}
