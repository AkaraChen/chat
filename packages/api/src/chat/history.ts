import type { Spec } from "@json-render/core";

import { specOf, type ChatMessage } from "./message";

// A one-line account of which components an earlier answer showed. The model
// sees this instead of the full spec, which would cost tokens and invite copying.
export function describeSpec(spec: Spec | null): string {
  if (!spec) return "";
  const counts = new Map<string, number>();
  for (const element of Object.values(spec.elements ?? {})) {
    const type = (element as { type?: unknown } | null)?.type;
    if (typeof type !== "string" || type === "Answer") continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  if (counts.size === 0) return "";
  const parts = [...counts].map(([type, n]) => (n > 1 ? `${type} x${n}` : type));
  return `[The view showed: ${parts.join(", ")}]`;
}

/**
 * Stored messages as the model should read them: each view's `data-spec`
 * parts become one summary line where the view was. Text and tool parts stay.
 */
export function forModel(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    const summary = describeSpec(specOf(message.parts));
    const parts: ChatMessage["parts"] = [];
    let placed = false;
    for (const part of message.parts) {
      if (part.type !== "data-spec") {
        parts.push(part);
      } else if (!placed) {
        placed = true;
        if (summary) parts.push({ type: "text", text: summary });
      }
    }
    return { ...message, parts };
  });
}
