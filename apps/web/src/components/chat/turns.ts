import type { TraceStep } from "../answer";
import type { ChatMessage } from "./transport";

export type Source = { repo: string; number: number };

/** An assistant turn keeps its parts: prose and view come from them when drawn. */
export type Turn =
  | { id: string; role: "user"; text: string; source: Source | null; attachment?: string | null }
  | { id: string; role: "assistant"; steps: TraceStep[]; parts: ChatMessage["parts"] };

type Detail = NonNullable<TraceStep["detail"]>;

// Loading the GitHub tools is plumbing, not a step the reader cares about,
// and a widget is drawn in the answer itself.
const HIDDEN = new Set(["tool_search", "show_widget"]);

function stepOf(part: ChatMessage["parts"][number]): TraceStep | null {
  if (!part.type.startsWith("tool-") || !("state" in part)) return null;
  const tool = part.type.slice("tool-".length);
  if (HIDDEN.has(tool)) return null;
  if (part.state === "output-error") return { tool, status: "error" };
  if (part.state === "output-available") {
    const detail = (part.output as { detail?: Detail } | undefined)?.detail;
    return { tool, status: "done", detail };
  }
  return { tool, status: "running" };
}

/** Flatten messages into what the thread draws. */
export function toTurns(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    if (message.role === "assistant") {
      const steps = message.parts.map(stepOf).filter((step): step is TraceStep => step !== null);
      turns.push({ id: message.id, role: "assistant", steps, parts: message.parts });
    } else if (message.role === "user") {
      const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
      turns.push({ id: message.id, role: "user", text, source: null });
    }
  }
  // The source capsule shows only when a GitHub tool really ran for that
  // question, so it comes from the answer that follows.
  turns.forEach((turn, index) => {
    const next = turns[index + 1];
    if (turn.role !== "user" || next?.role !== "assistant") return;
    for (const step of next.steps) {
      const detail = step.detail;
      if (step.status === "done" && typeof detail?.repo === "string" && detail.number != null) {
        turn.source = { repo: detail.repo, number: Number(detail.number) };
        break;
      }
    }
  });
  return turns;
}
