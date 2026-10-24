import type { Template } from "./types";
import { PLACEHOLDER_NOTE } from "./types";

export const id = "meeting" as const;

export const when = `Use when the user pastes meeting notes or asks to organise a meeting: what was decided, who owns what, what is still open. ${PLACEHOLDER_NOTE}`;

export const components = ["Answer", "Decisions", "OpenItems", "Todo"] as const;

export const prose =
  "How many things were decided and how many are still open, in one or two sentences.";

export const usage = {
  Answer: "Root container with empty props. List the other elements in reading order.",
  Decisions: "Only things the notes say were settled. One short sentence each.",
  OpenItems:
    "Two groups of unresolved questions (for example by theme), each with exactly two cards. If the notes have fewer open items, leave this component out.",
  Todo: "One element per follow-up that names a person. Time is the user's own wording. Skip follow-ups without an owner.",
} as const;

export const example: Template["example"] = {
  root: "answer",
  elements: {
    answer: {
      type: "Answer",
      props: {},
      children: ["decisions", "open", "todo-1", "todo-2"],
    },
    decisions: {
      type: "Decisions",
      props: {
        items: [
          "Ship the first version on Friday.",
          "Keep the sign-in flow as it is.",
          "Move reporting to the next cycle.",
        ],
      },
      children: [],
    },
    open: {
      type: "OpenItems",
      props: {
        groups: [
          {
            title: "Scope",
            cards: [
              { title: "Export format", detail: "CSV only, or PDF as well?" },
              { title: "Mobile layout", detail: "In the first release or later?" },
            ],
          },
          {
            title: "People",
            cards: [
              { title: "Design review", detail: "Nobody has picked it up yet." },
              { title: "On-call", detail: "Rotation not agreed." },
            ],
          },
        ],
      },
      children: [],
    },
    "todo-1": {
      type: "Todo",
      props: { person: "Mina", task: "Send the release checklist", time: "Wednesday" },
      children: [],
    },
    "todo-2": {
      type: "Todo",
      props: { person: "Jonas", task: "Confirm the export format with support", time: "Thursday" },
      children: [],
    },
  },
};

export const terms = [
  "meeting",
  "minutes",
  "agenda",
  "decision",
  "decided",
  "action item",
  "follow-up",
  "follow up",
  "owner",
  "attendee",
  "standup",
  "sync",
  "retro",
  "notes",
  "会议",
  "会议纪要",
  "纪要",
  "决定",
  "决议",
  "待办",
  "负责人",
  "未决",
  "跟进",
  "例会",
  "复盘",
] as const;

export const meeting: Template = { id, when, prose, components, usage, example, terms };
