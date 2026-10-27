import type { Template } from "./types";
import { PLACEHOLDER_NOTE } from "./types";

export const id = "capability-check" as const;

export const when = `Use when the user asks whether a platform, runtime, API or version supports a feature (does X support Y, X 支持 Y 吗, 兼容吗), or asks where the limit is. Answer the capability first, then separate what works from what does not and what it would take. Use only facts the user gave or a tool returned; when the version or the answer is unknown, say so. ${PLACEHOLDER_NOTE}`;

export const components = ["Answer", "Rows", "Sources"] as const;

export const prose =
  "The short answer in one sentence, then the exact boundary: what works, what does not, and what it would take.";

export const usage = {
  Answer: "Root container with empty props. List the other elements in reading order.",
  Rows: "One card for the verdict, one row per capability. status is negative when unsupported, neutral when partial or requiring work, and positive when supported. Each value is a word or a short phrase; why goes in the prose. A second Rows card may list the effort; leave status off those rows.",
  Sources:
    "Only sources actually read in tool results or sent by the user, one per row. Omit the element when there are none. Never invent a source.",
} as const;

export const example: Template["example"] = {
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

export const terms = [
  "support",
  "supports",
  "supported",
  "support for",
  "compatible",
  "compatibility",
  "capability",
  "limitation",
  "limitations",
  "extension",
  "extensions",
  "webextension",
  "webextensions",
  "safari",
  "wpe",
  "webkit",
  "webview",
  "支持",
  "是否支持",
  "兼容",
  "兼容性",
  "扩展",
  "插件",
  "能力",
  "限制",
  "能不能",
  "可以吗",
  "有没有",
] as const;

export const capabilityCheck: Template = {
  id,
  when,
  prose,
  components,
  usage,
  example,
  terms,
};
