import { ExportIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { client, orpc } from "@/utils/orpc";

import { preloadable } from "../preloadable";
import { EmptyPane } from "./empty-pane";
import { ExportDialog } from "./export-dialog";
import { ModelPicker } from "./model-picker";
import { PaneLoading } from "./pane-loading";
import type { SettingsData } from "./settings/settings-dialog";
import type { SettingsTab } from "./settings/tabs";
import { Sidebar } from "./sidebar";
import { historyQuery, type Pending } from "./thread-history";

// The thread (the AI SDK, markdown, views) and the settings dialog load on
// their own, so the empty state and the shell show before they arrive.
const threadPane = preloadable(() => import("./thread-pane").then((m) => m.ThreadPane));
const settingsDialog = preloadable(() =>
  import("./settings/settings-dialog").then((m) => m.SettingsDialog),
);
const ThreadPane = threadPane.Component;
const SettingsDialog = settingsDialog.Component;
const loadThreadPane = threadPane.preload;
// Most visits end in a thread; the settings are small. Both load when idle.
const preloadPanes = () => {
  void threadPane.preload();
  void settingsDialog.preload();
};

type ThreadList = { id: string; title: string; updatedAt: Date | string }[];

// A title is usually ready a few seconds after the first answer is saved
// (which also moves the thread's updatedAt), so ask often at first, then
// rarely, then stop, in case the worker is down.
const TITLE_POLL_MS = 2000;
const TITLE_FAST_MS = 30 * 1000;
const TITLE_SLOW_POLL_MS = 15 * 1000;
const TITLE_WAIT_MS = 5 * 60 * 1000;
const PREFETCH_FRESH_MS = 30 * 1000;

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pending = useRef<Pending | null>(null);
  // Mounted on first open and kept, so closing it keeps what it holds.
  const settingsOpened = useRef(false);
  if (settings) settingsOpened.current = true;
  const exportOpened = useRef(false);
  const [exportOpen, setExportOpen] = useState(false);
  if (exportOpen) exportOpened.current = true;

  // The newest thread keeps its cut-off title until the background task has
  // summarised it, so ask again until it has.
  const threads = useQuery({
    ...orpc.threads.list.queryOptions({
      refetchInterval: (query) => {
        const newest = query.state.data?.[0];
        if (!newest || newest.titledAt) return false;
        const waited = Date.now() - new Date(newest.updatedAt).getTime();
        if (waited < TITLE_FAST_MS) return TITLE_POLL_MS;
        return waited < TITLE_WAIT_MS ? TITLE_SLOW_POLL_MS : false;
      },
    }),
    enabled: threadList === undefined,
  });
  const shown = threadList ?? threads.data ?? [];
  // A list handed in by the caller is already read. Otherwise the sidebar
  // shows its skeleton until the first read lands.
  const threadsLoading = threadList === undefined && threads.isPending;
  // The sidebar reads threads.list.queryKey(). key() is only the prefix, and
  // setQueryData matches exactly, so writing there never reaches this query.
  const listKey = orpc.threads.list.queryKey();

  useEffect(() => {
    // Safari has no requestIdleCallback.
    if (typeof requestIdleCallback !== "function") {
      const id = setTimeout(preloadPanes, 1000);
      return () => clearTimeout(id);
    }
    const id = requestIdleCallback(preloadPanes);
    return () => cancelIdleCallback(id);
  }, []);

  // A new thread is empty and already listed, so it opens without asking the
  // server for either; the first message goes out as soon as it shows.
  async function start(text: string) {
    try {
      // The thread's code loads alongside, so it opens without waiting on it.
      // If that load fails, the pane's own lazy load tries again.
      const [created] = await Promise.all([
        client.threads.create({ text }),
        loadThreadPane().catch(() => {}),
      ]);
      pending.current = { threadId: created.id, text };
      queryClient.setQueryData(historyQuery(created.id).queryKey, { ...created, messages: [] });
      // A title poll in flight would otherwise write the list without it.
      await queryClient.cancelQueries({ queryKey: listKey });
      queryClient.setQueryData(listKey, (current) => [
        created,
        ...(current ?? []).filter((item) => item.id !== created.id),
      ]);
      await navigate({ to: "/chat", search: { thread: created.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("shell.startFailed"));
      throw error;
    }
  }

  async function renameThread(id: string, title: string) {
    try {
      const updated = await client.threads.rename({ id, title });
      await queryClient.cancelQueries({ queryKey: listKey });
      queryClient.setQueryData(listKey, (current) =>
        current?.map((item) => (item.id === id ? { ...item, ...updated } : item)),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("shell.renameFailed"));
      throw error;
    }
  }

  async function deleteThread(id: string) {
    try {
      await client.threads.delete({ id });
      await queryClient.cancelQueries({ queryKey: listKey });
      queryClient.setQueryData(listKey, (current) => current?.filter((item) => item.id !== id));
      queryClient.removeQueries({ queryKey: historyQuery(id).queryKey });
      if (thread === id) {
        await navigate({ to: "/chat", search: (prev) => ({ settings: prev.settings }) });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("shell.deleteFailed"));
    }
  }

  const openSettings = (tab: SettingsTab) =>
    navigate({ to: "/chat", search: (prev) => ({ ...prev, settings: tab }) });

  return (
    <div className="flex h-svh bg-fill p-2">
      <Sidebar
        threads={shown}
        loading={threadsLoading}
        activeId={thread}
        name={name}
        role={role}
        onSettings={() => openSettings("general")}
        onRename={renameThread}
        onDelete={deleteThread}
        onPrefetch={(id) => {
          void loadThreadPane();
          // A read ahead holds for a while, so hovering the same rows again
          // does not ask again; opening one still refreshes it as usual.
          void queryClient.prefetchQuery({ ...historyQuery(id), staleTime: PREFETCH_FRESH_MS });
        }}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-line-quiet bg-paper shadow-[var(--elevation-panel)]">
        <header className="flex h-14 shrink-0 items-center justify-between px-4">
          <ModelPicker onConnect={() => openSettings("providers")} />
          {/* Only a chat that exists can be exported; the empty state has none. */}
          {thread ? (
            <button
              type="button"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen(true)}
              className={`flex h-8 items-center gap-1.5 rounded-full border pr-3 pl-2.5 text-[13px] leading-4 font-medium text-ink ${
                exportOpen ? "border-accent bg-accent-soft" : "border-line hover:bg-recessed"
              }`}
            >
              <ExportIcon size={14} />
              {t("shell.exportChat")}
            </button>
          ) : null}
        </header>
        {thread ? (
          <Suspense fallback={<PaneLoading />}>
            <ThreadPane
              key={thread}
              threadId={thread}
              pending={pending}
              onMissing={() => navigate({ to: "/chat", search: {}, replace: true })}
            />
          </Suspense>
        ) : (
          <EmptyPane name={name} onStart={start} />
        )}
      </main>
      {exportOpened.current ? (
        <ExportDialog
          open={exportOpen}
          threadId={thread}
          title={shown.find((item) => item.id === thread)?.title ?? ""}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
      {settingsOpened.current ? (
        <Suspense fallback={null}>
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
        </Suspense>
      ) : null}
    </div>
  );
}
