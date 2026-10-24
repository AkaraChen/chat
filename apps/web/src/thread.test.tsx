import { afterEach, expect, test } from "bun:test";
import type { Spec } from "@json-render/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Trace } from "./components/answer/trace";
import { ThreadView } from "./components/chat/thread-view";
import type { Turn } from "./components/chat/turns";

afterEach(() => cleanup());

const spec = {
  root: "answer",
  elements: {
    answer: {
      type: "Answer",
      props: { lead: "The review can ship.", source: "AkaraChen/chat#128" },
      children: ["chart", "stats", "table", "changes", "diff", "decisions", "open", "todo", "notes"],
    },
    chart: {
      type: "LineChart",
      props: {
        title: "Real GDP",
        unit: "%",
        series: [{ name: "GDP", points: [{ x: "2023", y: 1.8 }, { x: "2024", y: 1.6 }] }],
      },
      children: [],
    },
    stats: {
      type: "StatStrip",
      props: { cells: [{ label: "Growth", value: "1.8%", compare: "vs last year" }] },
      children: [],
    },
    table: {
      type: "Table",
      props: { columns: ["Year", "GDP"], rows: [["2024", "1.6"]] },
      children: [],
    },
    changes: {
      type: "Changes",
      props: { files: [{ path: "apps/web/src/shell.tsx", additions: 12, deletions: 3 }] },
      children: [],
    },
    diff: {
      type: "Diff",
      props: {
        file: "apps/web/src/shell.tsx",
        startLine: 10,
        note: "The shell follows the artboard.",
        patch: " const ready = true;\n+const name = \"Eric\";\n-const name = \"\";",
      },
      children: [],
    },
    decisions: {
      type: "Decisions",
      props: { items: ["Ship the review."] },
      children: [],
    },
    open: {
      type: "OpenItems",
      props: {
        groups: [
          {
            title: "Blockers",
            cards: [
              { title: "CI", detail: "One check is red." },
              { title: "Types", detail: "A fixture is loose." },
            ],
          },
          {
            title: "Questions",
            cards: [
              { title: "Scope", detail: "Keep the export as a button." },
              { title: "Copy", detail: "Say the key stays on this device." },
            ],
          },
        ],
      },
      children: [],
    },
    todo: {
      type: "Todo",
      props: { person: "Eric", task: "Reply on the thread", time: "Today" },
      children: [],
    },
    notes: {
      type: "Notes",
      props: { title: "Notes", items: ["The patch is small."] },
      children: [],
    },
  },
} as Spec;

const turns: Turn[] = [
  {
    id: "user",
    role: "user",
    text: "Review AkaraChen/chat#128.",
    attachment: "Launch review notes",
    source: { repo: "AkaraChen/chat", number: 128 },
  },
  {
    id: "assistant",
    role: "assistant",
    spec,
    steps: [
      { tool: "search_templates", status: "done", detail: { template: "review" } },
      {
        tool: "get_pull_request_diff",
        status: "done",
        detail: { additions: 214, deletions: 86, repo: "AkaraChen/chat", number: 128 },
      },
    ],
  },
];

test("a thread shows the attachment, trace, answer cards, and composer tools", () => {
  render(<ThreadView turns={turns} draft="" onDraft={() => {}} onSend={() => {}} />);

  expect(screen.getByText("Launch review notes")).toBeTruthy();
  expect(screen.getByText("Review AkaraChen/chat#128.")).toBeTruthy();
  expect(screen.getByText("Found a template")).toBeTruthy();
  expect(screen.getByText("Review")).toBeTruthy();
  expect(screen.getByText("+214 -86")).toBeTruthy();
  expect(screen.getByText("Read the diff")).toBeTruthy();

  expect(screen.getByText("The review can ship.")).toBeTruthy();
  expect(screen.getByText("Decisions")).toBeTruthy();
  expect(screen.getByText("Still open")).toBeTruthy();
  expect(screen.getByText("To do")).toBeTruthy();
  expect(screen.getByText("Changes")).toBeTruthy();
  expect(screen.getByText("Diff")).toBeTruthy();
  expect(screen.getByText("Real GDP")).toBeTruthy();
  expect(screen.getByText("1.8%")).toBeTruthy();
  expect(screen.getByText("Year")).toBeTruthy();
  expect(screen.getByText("Notes")).toBeTruthy();
  expect(document.querySelectorAll("[data-answer-card]").length).toBeGreaterThan(0);
  for (const card of document.querySelectorAll("[data-answer-card]")) {
    expect(card.className).toContain("border-[#E3E3E7]");
  }

  fireEvent.click(screen.getByRole("button", { name: /Reviewed the diff/ }));
  expect(screen.queryByText("+214 -86")).toBeNull();
  expect(screen.queryByText("Read the diff")).toBeNull();

  expect(screen.getByRole("button", { name: "Deeper Research" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Attach" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Tools" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Microphone" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Globe" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Voice" })).toBeTruthy();
  expect(document.querySelector("form")?.className).toContain("bg-white");
  expect(screen.getByText("Review AkaraChen/chat#128.").parentElement?.className).toContain(
    "#F7F7F9",
  );
});

test("trace marks follow a running step and an error step", () => {
  const { rerender } = render(
    <Trace
      steps={[
        { tool: "search_templates", status: "running", detail: { template: "review" } },
        { tool: "get_pull_request_diff", status: "running", detail: { additions: 4, deletions: 1 } },
      ]}
    />,
  );
  expect(screen.getByText("Finding a template")).toBeTruthy();
  expect(screen.queryByText("Found a template")).toBeNull();
  expect(screen.queryByRole("img", { name: "Done" })).toBeNull();
  expect(screen.getAllByRole("img", { name: "Running" }).length).toBeGreaterThanOrEqual(2);

  rerender(
    <Trace
      steps={[
        { tool: "search_templates", status: "error", detail: { template: "review" } },
        { tool: "get_pull_request_diff", status: "error", detail: { additions: 4, deletions: 1 } },
      ]}
    />,
  );
  expect(screen.getByText("Finding a template failed")).toBeTruthy();
  expect(screen.getByText("Read the diff failed")).toBeTruthy();
  expect(screen.queryByRole("img", { name: "Done" })).toBeNull();
  expect(screen.queryByRole("img", { name: "Running" })).toBeNull();
  expect(screen.getAllByRole("img", { name: "Failed" }).length).toBeGreaterThanOrEqual(2);
});
