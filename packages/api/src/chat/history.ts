import type { ModelMessage } from "ai";

export type StoredMessage = { role: string; text: string; spec: string | null };

// A one-line account of which components an earlier answer showed. The model
// sees this instead of the full spec, which would cost tokens and invite copying.
export function describeSpec(specJson: string | null): string {
  if (!specJson) return "";
  let elements: unknown;
  try {
    elements = (JSON.parse(specJson) as { elements?: unknown }).elements;
  } catch {
    return "";
  }
  if (!elements || typeof elements !== "object") return "";
  const counts = new Map<string, number>();
  for (const element of Object.values(elements as Record<string, unknown>)) {
    const type = (element as { type?: unknown } | null)?.type;
    if (typeof type !== "string" || type === "Answer") continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  if (counts.size === 0) return "";
  const parts = [...counts].map(([type, n]) => (n > 1 ? `${type} x${n}` : type));
  return `[The view showed: ${parts.join(", ")}]`;
}

export function toModelMessages(messages: StoredMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: message.text });
    } else if (message.role === "assistant") {
      const summary = describeSpec(message.spec);
      out.push({
        role: "assistant",
        content: summary ? `${message.text}\n${summary}` : message.text,
      });
    }
  }
  return out;
}
