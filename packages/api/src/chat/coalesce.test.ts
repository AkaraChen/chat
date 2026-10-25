import { describe, expect, test } from "bun:test";

import { pipeJsonRender } from "@json-render/core";
import type { UIMessageChunk } from "ai";

import { coalesceTextDeltas } from "./coalesce";

async function collect(stream: ReadableStream<UIMessageChunk>) {
  const out: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

// Writes `bursts` with a pause between them, as a provider would.
function source(bursts: UIMessageChunk[][], pauseMs = 20) {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      for (const [index, burst] of bursts.entries()) {
        if (index > 0) await Bun.sleep(pauseMs);
        for (const chunk of burst) controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

const delta = (text: string, id = "1") =>
  ({ type: "text-delta", id, delta: text }) as UIMessageChunk;
const shape = (chunks: UIMessageChunk[]) =>
  chunks.map((c) => (c.type === "text-delta" ? c.delta : `<${c.type}>`));

describe("coalesceTextDeltas", () => {
  test("joins a burst, keeps bursts apart, and breaks at other chunks", async () => {
    const out = await collect(
      source([
        [{ type: "text-start", id: "1" }, delta("回"), delta("鹘"), delta("与")],
        [delta("唐"), delta("朝"), { type: "text-end", id: "1" }],
      ]).pipeThrough(coalesceTextDeltas()),
    );
    expect(shape(out)).toEqual(["<text-start>", "回鹘与", "唐朝", "<text-end>"]);
  });

  test("deltas with provider metadata or another id stay apart", async () => {
    const meta = { type: "text-delta", id: "1", delta: "b", providerMetadata: { x: { y: 1 } } };
    const out = await collect(
      source([[delta("a"), meta as UIMessageChunk, delta("c"), delta("d", "2")]]).pipeThrough(
        coalesceTextDeltas(),
      ),
    );
    expect(shape(out)).toEqual(["a", "b", "c", "d"]);
  });

  test("after pipeJsonRender, prose comes out whole and spec lines still become patches", async () => {
    const prose = "回鹘与唐朝的关系，名义上是藩属。\n";
    const spec = '```spec\n{"op":"add","path":"/root","value":"a"}\n```\n';
    const out = await collect(
      pipeJsonRender(
        source([
          [{ type: "text-start", id: "1" }, delta(prose + spec), { type: "text-end", id: "1" }],
        ]),
      ).pipeThrough(coalesceTextDeltas()),
    );
    const deltas = out.filter((c) => c.type === "text-delta");
    expect(deltas.length).toBeLessThanOrEqual(2);
    expect(deltas.map((c) => (c as { delta: string }).delta).join("")).toBe(prose);
    expect(out.some((c) => c.type === "data-spec")).toBe(true);
  });
});
