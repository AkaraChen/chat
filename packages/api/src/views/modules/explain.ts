import type { ViewModule } from "../types";

export const id = "explain" as const;

export const summary = "understand how something works: a process, a mechanism, an architecture";

export const when =
  "Use when the user asks how something works, what happens when, or how it is put together. Decide first whether they want a reference they can point at (the steps, the parts) or the idea itself (why it behaves the way it does). For the idea, the prose carries the intuition, maybe with an analogy, and a small diagram anchors it. When nothing here can draw the mechanism (a physical cross-section, motion, a spatial metaphor), load the widget module as well. Prose: the one-sentence answer first, then a sentence before each view saying what it shows.";

export const routes = [
  ["what are the steps / walk me through the process", "Flow (down) or Steps (list)"],
  ["what happens when I …", "Flow with a decision node and labelled yes/no edges"],
  ["how is it organised / where does X live", "Structure"],
  ["what are the parts of the system and how do they talk", "Flow (right) between the parts"],
  ["explain the stages of a cycle (the event loop, a lifecycle)", "Steps in stepper mode"],
  [
    "how does X actually work / give me an intuition",
    "prose, then one small Flow or Structure; a widget when it needs a picture",
  ],
] as const;

export const components = ["Answer", "Flow", "Structure", "Steps", "Notes"] as const;

export const usage = {
  Answer: "Root container with empty props. List the other elements in reading order.",
  Flow: "Give nodes and edges; the app lays them out. Labels are at most five words, detail one short line. Edge labels only where the edge branches. A loop back is fine. More than four nodes in one rank do not fit: chain them or split the diagram. For a big system, draw the overview first and the detail in a second view.",
  Structure:
    "Containment only: a box holds the boxes inside it. Use tone accent for the box the question is about.",
  Steps:
    "Ordered stages with a title and one or two sentences each. Use stepper mode when each stage needs the reader's full attention.",
  Notes: "Caveats or the two or three facts worth remembering, after the diagram.",
} as const;

export const example: ViewModule["example"] = {
  root: "answer",
  elements: {
    answer: { type: "Answer", props: {}, children: ["flow", "next"] },
    flow: {
      type: "Flow",
      props: {
        direction: "down",
        nodes: [
          { id: "request", label: "Request arrives" },
          { id: "cache", label: "In the cache?", tone: "accent" },
          { id: "hit", label: "Return cached copy" },
          { id: "origin", label: "Ask the origin", detail: "Slow path" },
          { id: "store", label: "Store and return" },
        ],
        edges: [
          { from: "request", to: "cache" },
          { from: "cache", to: "hit", label: "yes" },
          { from: "cache", to: "origin", label: "no" },
          { from: "origin", to: "store" },
        ],
      },
      children: [],
    },
    next: {
      type: "FollowUps",
      props: {
        items: [
          {
            label: "When does a copy expire?",
            prompt: "How does the cache decide when a copy has expired?",
          },
        ],
      },
      children: [],
    },
  },
};

export const explain: ViewModule = { id, summary, when, routes, components, usage, example };
