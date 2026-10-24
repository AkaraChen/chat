import type { Spec } from "@json-render/core";

import { compileSpecText, type TraceStep } from "../answer";
import type { ChatMessage } from "./transport";

export type Source = { repo: string; number: number };

export type Turn =
  | { id: string; role: "user"; text: string; source: Source | null }
  | { id: string; role: "assistant"; steps: TraceStep[]; spec: Spec | null };

type Detail = NonNullable<TraceStep["detail"]>;

function asSpec(value: unknown): Spec | null {
  if (!value || typeof value !== "object") return null;
  const spec = value as Partial<Spec>;
  return spec.root && spec.elements ? (spec as Spec) : null;
}

function stepOf(part: ChatMessage["parts"][number]): TraceStep | null {
  if (!part.type.startsWith("tool-") || !("state" in part)) return null;
  const tool = part.type.slice("tool-".length);
  if (part.state === "output-error") return { tool, status: "error" };
  if (part.state === "output-available") {
    const detail = (part.output as { detail?: Detail } | undefined)?.detail;
    return { tool, status: "done", detail };
  }
  return { tool, status: "running" };
}

function assistantTurn(message: ChatMessage): Turn {
  const steps: TraceStep[] = [];
  let finalSpec: Spec | null = null;
  let lastText = -1;
  let lastReset = -1;
  message.parts.forEach((part, index) => {
    if (part.type === "text") lastText = index;
    else if (part.type === "data-spec-reset") lastReset = index;
    else if (part.type === "data-spec") finalSpec = asSpec(part.data);
    else {
      const step = stepOf(part);
      if (step) steps.push(step);
    }
  });
  // The final step's text is the answer. Text before a reset is not.
  let spec: Spec | null = finalSpec;
  if (!spec && lastText > lastReset) {
    const part = message.parts[lastText];
    if (part.type === "text") spec = compileSpecText(part.text);
  }
  return { id: message.id, role: "assistant", steps, spec };
}

/** Flatten messages into what the thread draws. */
export function toTurns(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    if (message.role === "assistant") {
      turns.push(assistantTurn(message));
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

type HistoryMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  spec: unknown;
  steps: { tool: string; status: "running" | "done" | "error"; detail: Record<string, unknown> }[];
};

/** Persisted messages in the same shape the stream produces. */
export function fromHistory(messages: HistoryMessage[]): ChatMessage[] {
  return messages.map((message): ChatMessage => {
    if (message.role === "user") {
      return { id: message.id, role: "user", parts: [{ type: "text", text: message.text }] };
    }
    const parts: ChatMessage["parts"] = message.steps.map((step, index) =>
      step.status === "error"
        ? {
            type: `tool-${step.tool}`,
            toolCallId: `${message.id}-${index}`,
            state: "output-error",
            input: {},
            errorText: "failed",
          }
        : {
            type: `tool-${step.tool}`,
            toolCallId: `${message.id}-${index}`,
            state: "output-available",
            input: {},
            output: { detail: step.detail },
          },
    );
    if (message.spec) parts.push({ type: "data-spec", data: message.spec });
    return { id: message.id, role: "assistant", parts };
  });
}
