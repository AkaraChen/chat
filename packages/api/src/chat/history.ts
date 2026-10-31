import type { Spec } from "@json-render/core";

import { viewsOf, type ChatMessage, type ChatPart } from "./message";

// A one-line account of which components an earlier view showed. The model
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

// A widget's HTML stays in the model's history only in the latest answer, so
// the model can change what it just drew. Older ones keep their title.
function withoutWidgetHtml(part: ChatPart): ChatPart {
  if (part.type !== "tool-show_widget" || !("input" in part)) return part;
  const input = part.input as { title?: unknown; html?: unknown } | undefined;
  if (typeof input?.html !== "string") return part;
  return {
    ...part,
    input: { title: input.title, html: `(not kept: ${input.html.length} characters)` },
  } as ChatPart;
}

/**
 * Stored messages as the model should read them: each view's `data-spec`
 * parts become one summary line where the view was, and widgets before the
 * latest answer lose their HTML. Text and other tool parts stay.
 */
export function forModel(messages: ChatMessage[]): ChatMessage[] {
  const latest = messages.findLastIndex((message) => message.role === "assistant");
  return messages.map((message, messageIndex) => {
    if (message.role !== "assistant") return message;
    const summaries = new Map<number, string>();
    for (const view of viewsOf(message.parts)) {
      summaries.set(view.parts[0]!, describeSpec(view.spec));
    }
    const parts: ChatMessage["parts"] = [];
    for (const [index, part] of message.parts.entries()) {
      if (part.type === "data-spec") {
        const summary = summaries.get(index);
        if (summary) parts.push({ type: "text", text: summary });
      } else {
        parts.push(messageIndex === latest ? part : withoutWidgetHtml(part));
      }
    }
    return { ...message, parts };
  });
}
