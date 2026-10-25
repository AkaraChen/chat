import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

/** Text deltas shorter than this pass through as they come. */
export const PACE_MIN_CHARS = 24;
/** A large delta is cut into at most this many pieces. */
export const PACE_PIECES = 8;
/** A delta is spread over at most this long. */
export const PACE_MAX_MS = 120;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Cut `text` into `count` pieces without splitting a surrogate pair.
function cut(text: string, count: number): string[] {
  const size = Math.ceil(text.length / count);
  const pieces: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    const code = text.charCodeAt(end - 1);
    if (end < text.length && code >= 0xd800 && code <= 0xdbff) end += 1;
    pieces.push(text.slice(start, end));
    start = end;
  }
  return pieces;
}

/**
 * Some providers (Gemini through the proxy) send a few large deltas instead
 * of many small ones, so the answer lands in blocks. This spreads a large
 * delta over the time until the next one is likely to arrive: never longer
 * than the gap seen between the last two, so it does not fall behind, and
 * never longer than PACE_MAX_MS. Small deltas, and everything that is not
 * text, pass through untouched. `smoothStream` waits after every piece, which
 * would slow a fast provider and a long spec block.
 */
export function paceText<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
  return () => {
    let last = 0;
    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      async transform(part, controller) {
        if (part.type !== "text-delta") {
          controller.enqueue(part);
          return;
        }
        const now = performance.now();
        const gap = last === 0 ? 0 : now - last;
        last = now;
        const budget = Math.min(gap * 0.8, PACE_MAX_MS);
        if (part.text.length < PACE_MIN_CHARS || budget < PACE_PIECES) {
          controller.enqueue(part);
          return;
        }
        // Provider metadata goes once, on the last piece.
        const { providerMetadata, ...rest } = part;
        const pieces = cut(part.text, PACE_PIECES);
        const step = budget / pieces.length;
        for (const [index, text] of pieces.entries()) {
          if (index > 0) await wait(step);
          const final = index === pieces.length - 1;
          controller.enqueue(
            final && providerMetadata ? { ...rest, text, providerMetadata } : { ...rest, text },
          );
        }
        // Waiting counts toward the next gap; measure from when this one ended.
        last = performance.now();
      },
    });
  };
}
