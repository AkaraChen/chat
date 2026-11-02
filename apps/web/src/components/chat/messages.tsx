import type { Spec } from "@json-render/core";
import { viewsOf } from "@my-better-t-app/api/chat/message";
import { kindOf } from "@my-better-t-app/api/files/kind";
import { validateSpec } from "@my-better-t-app/api/views/catalog";
import { memo, useLayoutEffect, useMemo, useRef } from "react";

import { AnswerView, Trace, Widget } from "../answer";
import { RichText } from "../answer/rich-text";
import { GitHubMark } from "../github-mark";
import { Spinner } from "../spinner";
import { FileMark } from "./file-mark";
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
    a.turn.files.map((file) => file.url).join("\n") ===
      b.turn.files.map((file) => file.url).join("\n") &&
    a.turn.source?.repo === b.turn.source?.repo &&
    a.turn.source?.number === b.turn.source?.number,
);

const AssistantTurn = memo(
  AssistantTurnView,
  (a, b) => a.turn.parts === b.turn.parts && a.live === b.live,
);

// The files sit above the bubble, images first, as they were sent. Each
// opens on its own.
function UserBubbleView({ turn }: { turn: UserTurn }) {
  const images = turn.files.filter((file) => kindOf(file.mediaType) === "image");
  const documents = turn.files.filter((file) => kindOf(file.mediaType) !== "image");
  return (
    <div className="flex max-w-[560px] flex-col items-end gap-2 self-end">
      {images.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          {images.map((file) => (
            <a key={file.url} href={file.url} target="_blank" rel="noreferrer">
              <img
                src={file.url}
                alt={file.name}
                className="max-h-56 max-w-72 rounded-[14px] bg-recessed object-cover"
              />
            </a>
          ))}
        </div>
      ) : null}
      {documents.map((file) => (
        <a
          key={file.url}
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="flex w-64 items-center gap-2.5 rounded-[14px] bg-recessed py-2.5 pr-3.5 pl-2.5"
        >
          <FileMark mediaType={file.mediaType} name={file.name} />
        </a>
      ))}
      {turn.text || turn.source ? (
        <div className="flex flex-col items-start gap-2 rounded-[14px] bg-recessed px-3.5 py-2.5">
          {turn.text ? (
            <p className="text-[15px] leading-6 whitespace-pre-wrap text-ink">{turn.text}</p>
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
      ) : null}
    </div>
  );
}

// `at` is the index of the segment's first part, a key that stays put when a
// view before it is dropped.
type Segment = { at: number } & (
  | { kind: "text"; text: string }
  | { kind: "view"; spec: Spec }
  | { kind: "widget"; title: string; html: string; done: boolean }
);

/**
 * What an answer draws, in the order it was written: prose, views and
 * widgets. Each view sits where its first patch arrived; later patches
 * update that view. Once the turn is over, a view that fails the catalog is
 * left out, as the server does.
 */
function segmentsOf(parts: AssistantTurnData["parts"], live: boolean): Segment[] {
  const firsts = new Map(viewsOf(parts).map((view) => [view.parts[0]!, view.spec]));
  const segments: Segment[] = [];
  let text: string[] = [];
  let textAt = 0;
  const flush = () => {
    if (text.length) segments.push({ at: textAt, kind: "text", text: text.join("\n\n") });
    text = [];
  };
  parts.forEach((part, index) => {
    if (part.type === "text") {
      if (!part.text.trim()) return;
      if (text.length === 0) textAt = index;
      text.push(part.text.trim());
    } else if (firsts.has(index)) {
      flush();
      const spec = firsts.get(index)!;
      if (live || validateSpec(spec).length === 0) segments.push({ at: index, kind: "view", spec });
    } else if (part.type === "tool-show_widget" && "input" in part) {
      const input = (part.input ?? {}) as { title?: unknown; html?: unknown };
      if (typeof input.html !== "string" || !input.html) return;
      flush();
      segments.push({
        at: index,
        kind: "widget",
        title: typeof input.title === "string" ? input.title : "",
        html: input.html,
        done: part.state !== "input-streaming",
      });
    }
  });
  flush();
  return segments;
}

function AssistantTurnView({ turn, live }: { turn: AssistantTurnData; live: boolean }) {
  const segments = useMemo(() => segmentsOf(turn.parts, live), [turn.parts, live]);
  const waiting = live && turn.steps.length === 0 && segments.length === 0;
  return (
    <div className="flex flex-col gap-4">
      <Trace steps={turn.steps} />
      {segments.map((segment, index) => {
        const last = index === segments.length - 1;
        if (segment.kind === "text") {
          return (
            <RichText
              key={segment.at}
              text={segment.text}
              streaming={live && last}
              className="text-ink"
            />
          );
        }
        if (segment.kind === "view") {
          return <AnswerView key={segment.at} spec={segment.spec} loading={live && last} />;
        }
        return (
          <Widget key={segment.at} title={segment.title} html={segment.html} done={segment.done} />
        );
      })}
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
