import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { orpc } from "@/utils/orpc";

import { chatTransport, type ChatMessage } from "./transport";
import { ThreadView } from "./thread-view";
import { fromHistory, toTurns } from "./turns";
import { useModelChoice } from "./use-model-choice";

export type Pending = { threadId: string; text: string };

function Conversation({
  threadId,
  initial,
  pending,
}: {
  threadId: string;
  initial: ChatMessage[];
  pending: React.RefObject<Pending | null>;
}) {
  const queryClient = useQueryClient();
  const { ready } = useModelChoice();
  const [draft, setDraft] = useState("");
  const chat = useChat<ChatMessage>({
    id: threadId,
    messages: initial,
    transport: chatTransport,
    // The title is made after the first answer; refetching here starts the
    // sidebar's wait for it.
    onFinish: () => queryClient.invalidateQueries({ queryKey: orpc.threads.list.key() }),
  });
  const busy = chat.status === "submitted" || chat.status === "streaming";

  // A thread started from the empty state sends its first message once.
  useEffect(() => {
    const first = pending.current;
    if (first && first.threadId === threadId) {
      pending.current = null;
      void chat.sendMessage({ text: first.text });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const turns = useMemo(() => toTurns(chat.messages), [chat.messages]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void chat.sendMessage({ text });
  }

  return (
    <ThreadView
      turns={turns}
      streaming={busy}
      error={chat.status === "error" ? (chat.error?.message ?? "Something went wrong.") : null}
      draft={draft}
      onDraft={setDraft}
      onSend={send}
      busy={busy}
      disabled={!ready}
    />
  );
}

/** One thread: its history loads first, then the live conversation takes over. */
export function ThreadPane({
  threadId,
  pending,
  onMissing,
}: {
  threadId: string;
  pending: React.RefObject<Pending | null>;
  onMissing: () => void;
}) {
  // History is read fresh each time the thread opens; the live chat holds it after.
  const history = useQuery(
    orpc.threads.get.queryOptions({
      input: { id: threadId },
      gcTime: 0,
      staleTime: 0,
      refetchOnWindowFocus: false,
      retry: false,
      meta: { quiet: true },
    }),
  );
  const missing = history.isError;
  const onMissingRef = useRef(onMissing);
  onMissingRef.current = onMissing;
  useEffect(() => {
    if (missing) onMissingRef.current();
  }, [missing]);

  const initial = useMemo(
    () => (history.data ? fromHistory(history.data.messages) : null),
    [history.data],
  );
  if (!initial) return <div className="flex-1" />;
  return <Conversation key={threadId} threadId={threadId} initial={initial} pending={pending} />;
}
