import { useJsonRenderMessage } from "@json-render/react";
import { validateSpec } from "@my-better-t-app/api/templates/catalog";
import { PaperclipIcon } from "@phosphor-icons/react";
import { memo, useLayoutEffect, useMemo, useRef } from "react";

import { AnswerView, Trace } from "../answer";
import { RichText } from "../answer/rich-text";
import { GitHubMark } from "../github-mark";
import { Spinner } from "../spinner";
import type { Turn } from "./turns";

type UserTurn = Extract<Turn, { role: "user" }>;
type AssistantTurnData = Extract<Turn, { role: "assistant" }>;

// Turns are rebuilt from the messages on every streamed update, but only the
// last message changes; the AI SDK keeps the others, and their parts, as they
// were. Comparing what a turn draws from keeps the finished ones from parsing
// their markdown again on each update.
const UserBubble = memo(
  UserBubbleView,
  (a, b) =>
    a.turn.text === b.turn.text &&
    a.turn.attachment === b.turn.attachment &&
    a.turn.source?.repo === b.turn.source?.repo &&
    a.turn.source?.number === b.turn.source?.number,
);

const AssistantTurn = memo(
  AssistantTurnView,
  (a, b) => a.turn.parts === b.turn.parts && a.live === b.live,
);

function UserBubbleView({ turn }: { turn: UserTurn }) {
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

function AssistantTurnView({ turn, live }: { turn: AssistantTurnData; live: boolean }) {
  const { spec, text, hasSpec } = useJsonRenderMessage(turn.parts);
  // While streaming the view builds up as json-render draws it. Once the turn
  // is over, a view that fails the catalog is left out, as the server does.
  const view = useMemo(
    () => (hasSpec && (live || validateSpec(spec).length === 0) ? spec : null),
    [hasSpec, live, spec],
  );
  const waiting = live && turn.steps.length === 0 && !text && !view;
  return (
    <div className="flex flex-col gap-4">
      <Trace steps={turn.steps} />
      {text ? <RichText text={text} streaming={live} className="text-[#1C1C1E]" /> : null}
      <AnswerView spec={view} loading={live} />
      {waiting && <Spinner size={16} />}
    </div>
  );
}

/**
 * The conversation. Follows the stream unless the reader scrolled up.
 * Memoized, so typing in the composer does not draw the transcript again.
 */
export const Messages = memo(function Messages({
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

  const last = turns.at(-1);
  // Between sending and the first chunk there is no assistant turn yet.
  const awaiting = streaming && last?.role === "user";

  // Only when the transcript changes: reading scrollHeight forces a layout.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [turns, awaiting, error]);

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
});
