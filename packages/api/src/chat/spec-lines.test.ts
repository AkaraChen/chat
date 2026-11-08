import { describe, expect, test } from "bun:test";

import { pipeJsonRender } from "@json-render/core";
import type { UIMessageChunk } from "ai";

import { validateSpec } from "../views/catalog";
import { hasValidSpec, viewsOf, withoutInvalidSpec, type ChatMessage } from "./message";
import { repairSpecLine, repairSpecLines } from "./spec-lines";

async function collect(stream: ReadableStream<UIMessageChunk>) {
  const out: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

// One text block, cut into deltas of `size` characters, as a provider streams it.
function source(text: string, size = 7) {
  const chunks: UIMessageChunk[] = [{ type: "text-start", id: "1" }];
  for (let at = 0; at < text.length; at += size) {
    chunks.push({ type: "text-delta", id: "1", delta: text.slice(at, at + size) });
  }
  chunks.push({ type: "text-end", id: "1" });
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

const textOf = (chunks: UIMessageChunk[]) =>
  chunks.map((chunk) => (chunk.type === "text-delta" ? chunk.delta : "")).join("");

/** What the stream turns into: the prose, and the message parts it saves. */
async function render(text: string, size?: number) {
  const out = await collect(pipeJsonRender(source(text, size).pipeThrough(repairSpecLines())));
  const parts = out.flatMap((chunk): ChatMessage["parts"] =>
    chunk.type === "data-spec" ? [{ type: "data-spec", data: (chunk as never)["data"] }] : [],
  );
  return { prose: textOf(out), parts };
}

const fence = (...lines: string[]) => ["```spec", ...lines, "```"].join("\n");

const root = '{"op":"add","path":"/root","value":"answer"}';
const answer = (...children: string[]) =>
  `{"op":"add","path":"/elements/answer","value":{"type":"Answer","props":{},"children":${JSON.stringify(children)}}}`;

// Lines deepseek/deepseek-v4.1-flash-1017 wrote, as they came.
const shortBrace = String.raw`{"op":"add","path":"/elements/flow","value":{"type":"Diagram","props":{"source":"flowchart TD\n  call[\"你喊她\"] --> q{\"你的手还停着吗\"}"}}`;
const shortBraceNotes = String.raw`{"op":"add","path":"/elements/tips","value":{"type":"Notes","props":{"title":"先别急","items":["停下来"]}}`;
const extraBrace = String.raw`{"op":"add","path":"/elements/checks","value":{"type":"Notes","props":{"title":"三个自测","items":["换手背摸同一位置"]}},"children":[]}}`;
const extraBraceDiagram = String.raw`{"op":"add","path":"/elements/flow","value":{"type":"Diagram","props":{"source":"flowchart LR\n  a[问] --> b[答]"}},"children":[]}}`;
const noChildren = String.raw`{"op":"add","path":"/elements/checks","value":{"type":"Notes","props":{"title":"三个自测","items":["换手背摸同一位置"]}}}`;

describe("repairSpecLine", () => {
  test("closes a missing brace and drops an extra one", () => {
    expect(JSON.parse(repairSpecLine(shortBrace)).value.props.source).toContain("你的手还停着吗");
    expect(JSON.parse(repairSpecLine(extraBrace))).toEqual({
      op: "add",
      path: "/elements/checks",
      value: { type: "Notes", props: { title: "三个自测", items: ["换手背摸同一位置"] } },
      children: [],
    });
  });

  test("leaves good JSON, plain text and what it cannot repair as they were", () => {
    expect(repairSpecLine(` ${root} `)).toBe(` ${root} `);
    expect(repairSpecLine("这一行是正文")).toBe("这一行是正文");
    expect(repairSpecLine('"just a string"')).toBe('"just a string"');
    expect(repairSpecLine('{"op":"add"')).toBe('{"op":"add"');
    expect(repairSpecLine("```")).toBe("```");
  });
});

describe("repairSpecLines", () => {
  test("broken lines from a weaker model become a view that passes the catalog", async () => {
    const cases = [
      [shortBrace, "flow"],
      [shortBraceNotes, "tips"],
      [extraBrace, "checks"],
      [extraBraceDiagram, "flow"],
      [noChildren, "checks"],
    ] as const;
    for (const [line, key] of cases) {
      const { parts } = await render(`看图：\n\n${fence(root, answer(key), line)}\n`);
      const views = viewsOf(parts);
      expect(views).toHaveLength(1);
      expect([key, validateSpec(views[0]!.spec)]).toEqual([key, []]);
      expect(views[0]!.spec.elements[key]!.children).toEqual([]);
      expect(hasValidSpec(parts)).toBe(true);
    }
  });

  test("repairs the same however the text is cut into deltas", async () => {
    const text = fence(root, answer("flow", "checks"), shortBrace, extraBrace);
    for (const size of [1, 3, 64, text.length]) {
      expect(hasValidSpec((await render(text, size)).parts)).toBe(true);
    }
  });

  test("a fence line that ends with the text is repaired too", async () => {
    const { parts } = await render(["```spec", root, answer("checks"), extraBrace].join("\n"));
    expect(viewsOf(parts)[0]!.spec.elements.checks).toBeDefined();
  });

  test("text outside the fences passes through byte for byte", async () => {
    const text = [
      "前言 {not json",
      '{"op":"add","path":"/x"',
      "`code` and ```spec on the same line",
      "",
      fence(root, answer("flow"), shortBrace),
      "后记 }}",
      "",
    ].join("\n");
    const out = await collect(source(text, 5).pipeThrough(repairSpecLines()));
    const outside = (value: string) => value.replace(/```spec\n[\s\S]*?\n```/, "");
    expect(outside(textOf(out))).toBe(outside(text));
    expect((await render(text)).prose).toBe(
      [
        "前言 {not json",
        '{"op":"add","path":"/x"',
        "`code` and ```spec on the same line",
        "",
        "后记 }}",
        "",
      ].join("\n"),
    );
  });

  test("a fence opens wherever pipeJsonRender opens one", async () => {
    // The library starts a line at the first backtick, so this opens a fence.
    const text = `见下 ${fence(root, answer("checks"), extraBrace)}\n`;
    const { prose, parts } = await render(text);
    expect(prose).toBe("见下 ");
    expect(hasValidSpec(parts)).toBe(true);
    expect(viewsOf(parts)[0]!.spec.elements.checks).toBeDefined();
  });

  test("a line of plain text in a fence does not become a patch", async () => {
    const text = fence(root, "这里本该是一行 JSON", '"op: add"', answer());
    const out = await collect(source(text).pipeThrough(repairSpecLines()));
    expect(textOf(out)).toBe(text);
    expect((await render(text)).parts).toHaveLength(2);
  });
});

describe("views that are still invalid", () => {
  test("an unknown component, bad props or a missing element still fail", async () => {
    const invalid = [
      [answer("x"), '{"op":"add","path":"/elements/x","value":{"type":"Marquee","props":{}}'],
      [
        answer("x"),
        '{"op":"add","path":"/elements/x","value":{"type":"Notes","props":{"items":[]}}',
      ],
      [answer("missing"), noChildren],
    ];
    for (const lines of invalid) {
      const { parts } = await render(`前言\n${fence(root, ...lines)}\n`);
      expect(parts.length).toBeGreaterThan(1);
      expect(hasValidSpec(parts)).toBe(false);
      expect(withoutInvalidSpec({ id: "m", role: "assistant", parts }).parts).toEqual([]);
    }
  });
});
