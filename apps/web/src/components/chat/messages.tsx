import { PaperclipIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

import { AnswerView, Trace } from "../answer";
import { GitHubMark } from "../github-mark";
import { Spinner } from "../spinner";
import type { Turn } from "./turns";

function UserBubble({ turn }: { turn: Extract<Turn, { role: "user" }> }) {
  return (
    <div className="flex max-w-[560px] flex-col items-start gap-2 self-end rounded-[14px] bg-[#F7F7F9] px-3.5 py-2.5">
      <p className="text-[15px] leading-6 whitespace-pre-wrap text-[#1C1C1E]">{turn.text}</p>
      {turn.attachment ? (
        <span className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-[13px] text-[#1C1C1E]">
          <PaperclipIcon size={14} className="text-[#6E6E73]" />
          {turn.attachment}
        </span>
      ) : null}
      {turn.source && (
        <span className="flex items-center gap-1.5 rounded-lg bg-white py-1 pr-2.5 pl-2 text-[13px] text-[#1C1C1E]">
          <span className="flex size-4 items-center justify-center rounded-full bg-[#1C1C1E]">
            <GitHubMark size={10} />
          </span>
          {turn.source.repo} #{turn.source.number}
        </span>
      )}
    </div>
  );
}

function AssistantTurn({
  turn,
  live,
}: {
  turn: Extract<Turn, { role: "assistant" }>;
  live: boolean;
}) {
  const waiting = live && turn.steps.length === 0 && !turn.spec;
  return (
    <div className="flex flex-col gap-4">
      <Trace steps={turn.steps} />
      <AnswerView spec={turn.spec} loading={live} />
      {waiting && <Spinner size={16} />}
    </div>
  );
}

/** The conversation. Follows the stream unless the reader scrolled up. */
export function Messages({
  turns,
  streaming,
  error,
}: {
  turns: Turn[];
  streaming: boolean;
  error: string | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });

  const last = turns.at(-1);
  // Between sending and the first chunk there is no assistant turn yet.
  const awaiting = streaming && last?.role === "user";

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const el = event.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      }}
      className="flex-1 overflow-y-auto"
    >
      <div className="mx-auto flex max-w-[720px] flex-col gap-8 px-6 pt-4 pb-8">
        {turns.map((turn, index) =>
          turn.role === "user" ? (
            <UserBubble key={turn.id} turn={turn} />
          ) : (
            <AssistantTurn
              key={turn.id}
              turn={turn}
              live={streaming && index === turns.length - 1}
            />
          ),
        )}
        {awaiting && <Spinner size={16} />}
        {error && <p className="text-sm text-[#C2410C]">{error}</p>}
      </div>
    </div>
  );
}
