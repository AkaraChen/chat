import { SPEC_DATA_PART_TYPE } from "@json-render/core";
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
    <div className="flex max-w-[560px] flex-col items-start gap-2 self-end rounded-[14px] bg-recessed px-3.5 py-2.5">
      <p className="text-[15px] leading-6 whitespace-pre-wrap text-ink">{turn.text}</p>
      {turn.attachment ? (
        <span className="flex items-center gap-2 rounded-lg bg-paper px-2.5 py-1 text-[13px] text-ink">
          <PaperclipIcon size={14} className="text-ink-secondary" />
          {turn.attachment}
        </span>
      ) : null}
      {turn.source && (
        <span className="flex items-center gap-1.5 rounded-lg bg-paper py-1 pr-2.5 pl-2 text-[13px] text-ink">
          <span className="flex size-4 items-center justify-center rounded-full bg-solid text-on-solid">
            <GitHubMark size={10} fill="currentColor" />
          </span>
          {turn.source.repo} #{turn.source.number}
        </span>
      )}
    </div>
  );
}

// Text parts joined the way useJsonRenderMessage joins them.
function textOf(parts: AssistantTurnData["parts"]): string {
  return parts
    .map((part) => (part.type === "text" ? part.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

function AssistantTurnView({ turn, live }: { turn: AssistantTurnData; live: boolean }) {
  const { spec, hasSpec } = useJsonRenderMessage(turn.parts);
  // While streaming the view builds up as json-render draws it. Once the turn
  // is over, a view that fails the catalog is left out, as the server does.
  const view = useMemo(
    () => (hasSpec && (live || validateSpec(spec).length === 0) ? spec : null),
    [hasSpec, live, spec],
  );
  // The view is drawn where its first patch arrived, between the prose
  // written before it and after it. Later patches update that one view.
  const { before, after, placed } = useMemo(() => {
    const first = turn.parts.findIndex((part) => part.type === SPEC_DATA_PART_TYPE);
    return {
      before: textOf(first === -1 ? turn.parts : turn.parts.slice(0, first)),
      after: first === -1 ? "" : textOf(turn.parts.slice(first)),
      placed: first !== -1,
    };
  }, [turn.parts]);
  const waiting = live && turn.steps.length === 0 && !before && !after && !view;
  return (
    <div className="flex flex-col gap-4">
      <Trace steps={turn.steps} />
      {before ? <RichText text={before} streaming={live && !placed} className="text-ink" /> : null}
      <AnswerView spec={view} loading={live} />
      {after ? <RichText text={after} streaming={live} className="text-ink" /> : null}
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
        {error && <p className="text-sm text-warn">{error}</p>}
      </div>
    </div>
  );
});
