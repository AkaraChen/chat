import type { ViewModule } from "../types";

export const id = "recap" as const;

export const summary =
  "sort out a meeting, thread or document: what was decided, who does what, what is open";

export const when =
  "Use when the user pastes notes, a thread or a document and wants it organised: what was decided, who owns what, what is still open. Prose: how many things were decided and how many are still open, in one or two sentences.";

export const routes = [
  ["summarise these meeting notes", "Decisions, then OpenItems, then one Todo per owner"],
  ["what did we agree on", "Decisions only"],
  ["who is doing what", "one Todo per follow-up that names a person"],
  ["pull out the details of this order/contract/person", "Record"],
] as const;

export const components = ["Answer", "Decisions", "OpenItems", "Todo", "Notes", "Record"] as const;

export const usage = {
  Answer: "Root container with empty props. List the other elements in reading order.",
  Decisions: "Only things the notes say were settled. One short sentence each.",
  OpenItems:
    "Two groups of unresolved questions (for example by theme), each with exactly two cards. If the notes have fewer open items, leave this component out.",
  Todo: "One element per follow-up that names a person. Time is the user's own wording. Skip follow-ups without an owner.",
  Notes: "Loose observations that are neither decisions nor open questions.",
  Record:
    "One bounded thing the text describes (an order, a contract, a person): title, optional subtitle, up to eight label/value fields.",
} as const;

export const example: ViewModule["example"] = {
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

export const recap: ViewModule = { id, summary, when, routes, components, usage, example };
