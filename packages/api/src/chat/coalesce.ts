import type { UIMessageChunk } from "ai";

type TextDelta = Extract<UIMessageChunk, { type: "text-delta" }>;

/**
 * Joins adjacent text deltas back together. `pipeJsonRender` reads text one
 * character at a time to find spec lines, and writes each character as its
 * own delta, so without this every character is its own SSE event: about 50
 * bytes on the wire, and one more update for the browser to apply.
 *
 * Deltas are held until something else comes through or the current burst
 * ends (a zero-delay timer, which fires after the synchronous run that
 * produced them), so text reaches the reader no later than it would have.
 */
export function coalesceTextDeltas<CHUNK extends UIMessageChunk>(): TransformStream<CHUNK, CHUNK> {
  let held: TextDelta | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let out: TransformStreamDefaultController<CHUNK> | undefined;

  function release() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const chunk = held;
    held = null;
    if (!chunk || !out) return;
    try {
      out.enqueue(chunk as CHUNK);
    } catch {
      // The reader went away while the timer was pending; nothing to send to.
    }
  }

  return new TransformStream<CHUNK, CHUNK>({
    start(controller) {
      out = controller;
    },
    transform(chunk, controller) {
      if (chunk.type !== "text-delta") {
        release();
        controller.enqueue(chunk);
        return;
      }
      const delta = chunk as TextDelta;
      // Metadata belongs to the delta it came with; keep those apart.
      if (held && (held.id !== delta.id || held.providerMetadata || delta.providerMetadata)) {
        release();
      }
      held = held ? { ...held, delta: held.delta + delta.delta } : { ...delta };
      timer ??= setTimeout(release, 0);
    },
    flush() {
      release();
    },
  });
}
