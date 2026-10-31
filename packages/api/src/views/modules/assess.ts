import type { ViewModule } from "../types";

export const id = "assess" as const;

export const summary = "know whether something can, does or will work, and where the limit is";

export const when =
  "Use when the user asks whether a platform, runtime, API or version supports something (does X support Y, 支持吗, 兼容吗), whether a plan will work, or where the limit is. Answer first, then separate what works from what does not and what it would take. When the version or the answer is unknown, say so.";

export const routes = [
  ["does X support Y", "Rows with one verdict row per capability"],
  ["will this work / is this safe", "Rows with the verdict, then Notes for the caveats"],
  ["what would it take", "a second Rows with the effort per step, no status"],
] as const;

export const components = ["Answer", "Rows", "Notes"] as const;

export const usage = {
  Answer: "Root container with empty props. List the other elements in reading order.",
  Rows: "One card for the verdict, one row per capability. status is negative when unsupported, neutral when partial or requiring work, and positive when supported. Each value is a word or a short phrase; why goes in the prose. A second Rows card may list the effort; leave status off those rows.",
  Sources:
    "Only sources actually read in tool results or sent by the user, one per row. Omit the element when there are none. Never invent a source.",
  Notes: "Caveats and conditions that do not fit a verdict row.",
} as const;

export const example: ViewModule["example"] = {
  root: "answer",
  elements: {
    answer: {
      type: "Answer",
      props: {},
      children: ["verdict", "effort", "sources"],
    },
    verdict: {
      type: "Rows",
      props: {
        title: "The verdict",
        meta: "WPE 2.46",
        rows: [
          { label: "Safari App Extension", value: "No", status: "negative" },
          { label: "Safari Web Extension", value: "No", status: "negative" },
          { label: "Chrome or Firefox extension", value: "Engine only", status: "neutral" },
          { label: "Content blockers", value: "Reimplement in the host", status: "neutral" },
        ],
      },
      children: [],
    },
    effort: {
      type: "Rows",
      props: {
        title: "What it would take",
        meta: "13–18 weeks",
        rows: [
          { label: "Ship an extension host", value: "6–8 weeks" },
          { label: "Map the WebExtensions APIs", value: "4–6 weeks" },
          { label: "Build permission and install UI", value: "3–4 weeks" },
        ],
      },
      children: [],
    },
    sources: {
      type: "Sources",
      props: {
        title: "Sources",
        items: [
          { title: "WPE WebKit 2.46 — Release notes", source: "wpewebkit.org", kind: "web" },
          {
            title: "Safari App Extension — Programming guide",
            source: "developer.apple.com",
            kind: "web",
          },
          { title: "wpe-requirements.md", source: "attachment", kind: "file" },
        ],
      },
      children: [],
    },
  },
};

export const assess: ViewModule = { id, summary, when, routes, components, usage, example };
