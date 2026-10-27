import type { Template } from "./types";
import { PLACEHOLDER_NOTE } from "./types";

export const id = "tech-choice" as const;

export const when = `Use when the user asks which technology, framework, runtime, protocol or architecture to choose, or weighs two or three options against each other (X versus Y, 技术选型). Put the recommendation in the prose first. Use only facts the user gave or a tool returned; when a fact is unknown, say so instead of filling the cell. ${PLACEHOLDER_NOTE}`;

export const components = ["Answer", "Options", "Comparison", "Rows", "Sources"] as const;

export const prose =
  "The recommendation in one sentence, then the one condition that would change it.";

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

export const example: Template["example"] = {
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

export const terms = [
  "tech choice",
  "technical choice",
  "choose",
  "choice",
  "compare",
  "comparison",
  "versus",
  "vs",
  "trade-off",
  "tradeoff",
  "should we use",
  "should we build",
  "should we",
  "should i",
  "which should",
  "choose between",
  "migrate",
  "migration",
  "rewrite",
  "build vs buy",
  "framework",
  "library",
  "runtime",
  "stack",
  "architecture",
  "electron",
  "chromium",
  "browser",
  "fork",
  "选型",
  "技术选型",
  "怎么选",
  "选哪个",
  "还是",
  "对比",
  "比较",
  "方案",
  "架构",
  "框架",
  "运行时",
  "技术栈",
  "迁移",
  "重构",
  "自研",
  "替代",
  "浏览器",
] as const;

export const techChoice: Template = { id, when, prose, components, usage, example, terms };
