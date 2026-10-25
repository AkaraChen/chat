import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { orpc } from "@/utils/orpc";

import { historyQuery, type Pending } from "./thread-history";
import { chatTransport, type ChatMessage } from "./transport";
import { ThreadView } from "./thread-view";
import { toTurns } from "./turns";
import { useModelChoice } from "./use-model-choice";

export type { Pending };

// Draw the stream at most this often. Each draw parses the answer's markdown.
const STREAM_THROTTLE_MS = 50;

// Only the newest message can differ between two reads that agree on the
// count: an answer cut short here and finished on the server keeps its id.
function sameMessages(a: ChatMessage[], b: ChatMessage[]) {
  return a.length === b.length && JSON.stringify(a.at(-1)) === JSON.stringify(b.at(-1));
}

function Conversation({
  threadId,
  initial,
  pending,
}: {
  threadId: string;
  initial: ChatMessage[];
  pending: React.RefObject<Pending | null>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { ready } = useModelChoice();
  const [draft, setDraft] = useState("");
  const chat = useChat<ChatMessage>({
    id: threadId,
    messages: initial,
    transport: chatTransport,
    throttle: STREAM_THROTTLE_MS,
    onFinish: ({ messages, isAbort, isDisconnect, isError }) => {
      // The next visit then starts from this answer, not the one cached before
      // it. An answer cut short here (the reader left, the connection dropped)
      // is still finished and saved by the server, so it is not cached.
      if (!isAbort && !isDisconnect && !isError) {
        queryClient.setQueryData(historyQuery(threadId).queryKey, (current) =>
          current ? { ...current, messages } : current,
        );
      }
      // The title is made after the first answer; refetching here starts the
      // sidebar's wait for it.
      void queryClient.invalidateQueries({ queryKey: orpc.threads.list.key() });
    },
  });
  const busy = chat.status === "submitted" || chat.status === "streaming";

  // The thread can open from the cache while a fresh read is on its way. When
  // that read differs (an answer that ended after this tab left, another
  // device), it replaces what is shown, unless a turn is under way.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const { messages: shown, setMessages } = chat;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  useEffect(() => {
    if (!busyRef.current && !sameMessages(initial, shownRef.current)) setMessages(initial);
  }, [initial, setMessages]);

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
      error={chat.status === "error" ? (chat.error?.message ?? t("thread.failed")) : null}
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
  const history = useQuery(historyQuery(threadId));
  const missing = history.isError;
  const onMissingRef = useRef(onMissing);
  onMissingRef.current = onMissing;
  useEffect(() => {
    if (missing) onMissingRef.current();
  }, [missing]);

  // Stored messages are already UIMessages, the same shape the stream builds.
  const initial = history.data?.messages ?? null;
  if (!initial) return <div className="flex-1" />;
  return <Conversation key={threadId} threadId={threadId} initial={initial} pending={pending} />;
}
