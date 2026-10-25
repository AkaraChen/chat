import { describe, expect, test } from "bun:test";

import type { TextStreamPart, ToolSet } from "ai";

import { PACE_MAX_MS, PACE_PIECES, paceText } from "./pace";

type Part = TextStreamPart<ToolSet>;

const delta = (text: string, extra: Partial<Part> = {}) =>
  ({ type: "text-delta", id: "t", text, ...extra }) as Part;

// Feeds `parts` through the transform, waiting `gapMs` before each one after
// the first, and returns what comes out with the time each piece left.
async function run(parts: Part[], gapMs: number) {
  const transform = paceText()({ tools: {}, stopStream: () => {} } as never);
  const writer = transform.writable.getWriter();
  const out: { part: Part; at: number }[] = [];
  const start = performance.now();
  const reading = (async () => {
    const reader = transform.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      out.push({ part: value, at: performance.now() - start });
    }
  })();
  for (const [index, part] of parts.entries()) {
    if (index > 0) await Bun.sleep(gapMs);
    await writer.write(part);
  }
  await writer.close();
  await reading;
  return out;
}

const texts = (out: { part: Part }[]) =>
  out.map(({ part }) => (part.type === "text-delta" ? part.text : `<${part.type}>`));

describe("paceText", () => {
  test("a large delta after a gap is cut into pieces spread under the gap", async () => {
    const big = "回鹘与唐朝的关系在名义上是藩属，实际上更像盟友。".repeat(4);
    const out = await run([delta("开头"), delta(big)], 100);
    const pieces = out.slice(1);
    expect(pieces).toHaveLength(PACE_PIECES);
    expect(texts(pieces).join("")).toBe(big);
    const spread = pieces.at(-1)!.at - pieces[0]!.at;
    expect(spread).toBeGreaterThan(30);
    expect(spread).toBeLessThan(PACE_MAX_MS);
  });

  test("small deltas, back-to-back deltas and other parts pass through", async () => {
    const big = "x".repeat(200);
    const parts = [delta("a"), { type: "text-start", id: "t" } as Part, delta(big), delta("b")];
    const out = await run(parts, 0);
    expect(texts(out)).toEqual(["a", "<text-start>", big, "b"]);
  });

  test("a surrogate pair is never split, and metadata stays on the last piece", async () => {
    const big = "😀".repeat(40);
    const meta = { google: { thoughtSignature: "s" } };
    const out = await run([delta("a"), delta(big, { providerMetadata: meta } as never)], 60);
    const pieces = out.slice(1).map(({ part }) => part as Extract<Part, { type: "text-delta" }>);
    expect(pieces.map((p) => p.text).join("")).toBe(big);
    for (const piece of pieces) expect(piece.text).not.toMatch(/^[\udc00-\udfff]|[\ud800-\udbff]$/);
    expect(pieces.slice(0, -1).every((p) => p.providerMetadata === undefined)).toBe(true);
    expect(pieces.at(-1)!.providerMetadata).toEqual(meta);
  });
});
