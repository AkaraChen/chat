import type { UIMessageChunk } from "ai";
import { jsonrepair } from "jsonrepair";

type TextDelta = Extract<UIMessageChunk, { type: "text-delta" }>;

const FENCE_OPEN = "```spec";
const FENCE_CLOSE = "```";

const isPatch = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { op?: unknown }).op === "string" &&
  typeof (value as { path?: unknown }).path === "string";

/**
 * One line from inside a ```spec fence, repaired when it is not JSON but
 * jsonrepair can make a patch of it. Anything else comes back as it was, and
 * `pipeJsonRender` drops it as before. jsonrepair turns plain text into a
 * JSON string, so only an object with an `op` and a `path` counts.
 */
export function repairSpecLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return line;
  try {
    JSON.parse(trimmed);
    return line;
  } catch {}
  try {
    const value: unknown = JSON.parse(jsonrepair(trimmed));
    return isPatch(value) ? JSON.stringify(value) : line;
  } catch {
    return line;
  }
}

/**
 * Repairs the JSON Patch lines a model writes inside ```spec fences before
 * `pipeJsonRender` reads them; weaker models miss or add a closing brace,
 * and the library drops a line that does not parse. Text outside the fences
 * passes through as it came.
 *
 * Lines are split the way `pipeJsonRender` splits them, so a fence opens and
 * closes here exactly where it does there. A fence line is held until it
 * ends, at a newline or at the end of the text; the library holds those
 * lines too, so nothing reaches the reader later than it would have.
 */
export function repairSpecLines<CHUNK extends UIMessageChunk>(): TransformStream<CHUNK, CHUNK> {
  let inFence = false;
  // Outside a fence, whether the library is holding this line to test it.
  let buffering = false;
  // The line so far: outside a fence only while buffering, inside always.
  let line = "";
  let id = "";

  // A fence line that ends without a newline: the library parses it as it is.
  function release(controller: TransformStreamDefaultController<CHUNK>) {
    if (inFence && line) {
      controller.enqueue({ type: "text-delta", id, delta: repairSpecLine(line) } as CHUNK);
    }
    line = "";
    buffering = false;
  }

  return new TransformStream<CHUNK, CHUNK>({
    transform(chunk, controller) {
      if (chunk.type === "text-end") release(controller);
      if (chunk.type !== "text-delta") {
        controller.enqueue(chunk);
        return;
      }
      const delta = chunk as TextDelta;
      id = delta.id;
      let out = "";
      for (const ch of delta.delta) {
        if (inFence) {
          if (ch !== "\n") {
            line += ch;
          } else if (line.trim() === FENCE_CLOSE) {
            inFence = false;
            out += line + ch;
            line = "";
          } else {
            out += repairSpecLine(line) + ch;
            line = "";
          }
          continue;
        }
        out += ch;
        if (ch === "\n") {
          if (buffering && line.trim().startsWith(FENCE_OPEN)) inFence = true;
          buffering = false;
          line = "";
        } else if (buffering) {
          line += ch;
        } else if (ch === "{" || ch === "`") {
          buffering = true;
          line = ch;
        }
      }
      if (out) controller.enqueue({ ...delta, delta: out } as CHUNK);
    },
    flush(controller) {
      release(controller);
    },
  });
}
