import type { ViewModule } from "../types";

export const id = "compare" as const;

export const summary = "choose between two or three options";

export const when =
  "Use when the user weighs two or three options (X versus Y, which should I pick, 选型). Put the recommendation in the prose first, then the one condition that would change it. Use only facts the user gave or a tool returned; when a fact is unknown, say so instead of filling the cell.";

export const routes = [
  ["X or Y?", "Options with the recommended one marked, then a short Comparison"],
  ["compare X, Y and Z on cost and speed", "Comparison"],
  ["what would change your answer", "Rows: condition and outcome"],
  ["how much work is each path", "Rows: step and estimate"],
] as const;

export const components = ["Answer", "Options", "Comparison", "Rows"] as const;

export const usage = {
  Answer: "Root container with empty props. List the other elements in reading order.",
  Options:
    "Two or three options. Mark the recommended option when the prose recommends one; otherwise mark none. summary is one sentence; meta is a time, size or cost the answer can support, otherwise 'not estimated'.",
  Comparison:
    "The same criteria for every option, one short value per column in the same order. Mark the recommended column if Options marked one. Use only figures the user or a tool gave.",
  Rows: "Use once for what would change the answer (label = condition, value = outcome) or the next steps (label = step, value = estimate). Each value is a word or a short phrase; why goes in the prose. Status only when the value is a verdict.",
  Sources:
    "Only sources actually read in tool results or sent by the user, one per row. Omit the element when there are none. Never invent a source.",
} as const;

export const example: ViewModule["example"] = {
  root: "answer",
  elements: {
    answer: {
      type: "Answer",
      props: {},
      children: ["options", "comparison", "flip", "sources"],
    },
    options: {
      type: "Options",
      props: {
        title: "The call",
        options: [
          {
            name: "Electron",
            summary: "HTML chrome over Chromium. Extensions load unpacked.",
            meta: "4–6 weeks to beta",
            recommended: true,
          },
          {
            name: "Chromium fork",
            summary: "Own the chrome and the update train. Everything is yours to break.",
            meta: "9–12 months to beta",
            recommended: false,
          },
        ],
      },
      children: [],
    },
    comparison: {
      type: "Comparison",
      props: {
        title: "Side by side",
        columns: [
          { name: "Electron", recommended: true },
          { name: "Chromium fork", recommended: false },
        ],
        rows: [
          { criterion: "Tab strip", values: ["Web UI", "Native"] },
          { criterion: "Extensions", values: ["Unpacked only", "Full store support"] },
          { criterion: "Screen capture", values: ["Native module", "Built in"] },
          { criterion: "Updates", values: ["Electron releases", "You track Chromium"] },
          { criterion: "Team", values: ["2 engineers", "4+ engineers"] },
          { criterion: "First beta", values: ["4–6 weeks", "9–12 months"] },
        ],
      },
      children: [],
    },
    flip: {
      type: "Rows",
      props: {
        title: "What would flip it",
        meta: "3 triggers",
        rows: [
          { label: "Extension APIs beyond Chrome's", value: "Fork" },
          { label: "Install size under 120 MB", value: "System WebView" },
          { label: "Three engineers for a year", value: "Fork becomes viable" },
        ],
      },
      children: [],
    },
    sources: {
      type: "Sources",
      props: {
        title: "Sources",
        items: [
          { title: "Electron 38 — Process model", source: "electronjs.org", kind: "web" },
          { title: "Chromium — Content layer", source: "chromium.org", kind: "web" },
          { title: "browser-brief.md", source: "attachment", kind: "file" },
        ],
      },
      children: [],
    },
  },
};

export const compare: ViewModule = { id, summary, when, routes, components, usage, example };
