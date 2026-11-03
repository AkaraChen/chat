import type { ViewModule } from "../types";

export const id = "explain" as const;

export const summary = "understand how something works: a process, a mechanism, an architecture";

export const when =
  "Use when the user asks how something works, what happens when, or how it is put together. Decide first whether they want a reference they can point at (the steps, the parts) or the idea itself (why it behaves the way it does). For the idea, the prose carries the intuition, maybe with an analogy, and a small diagram anchors it. When nothing here can draw the mechanism (a physical cross-section, motion, a spatial metaphor), load the widget module as well. Prose: the one-sentence answer first, then a sentence before each view saying what it shows.";

export const routes = [
  ["what are the steps / walk me through the process", "Diagram flowchart TD, or Steps (list)"],
  ["what happens when I …", "Diagram flowchart with a decision and labelled yes/no edges"],
  ["how is it organised / where does X live", "Structure"],
  [
    "what are the parts of the system and how do they talk",
    "Diagram flowchart LR between the parts",
  ],
  ["who sends what to whom, in what order (a handshake, a login)", "Diagram sequenceDiagram"],
  ["what states can X be in / what moves it between them", "Diagram stateDiagram-v2"],
  ["how do these tables or types relate", "Diagram erDiagram or classDiagram"],
  ["explain the stages of a cycle (the event loop, a lifecycle)", "Steps in stepper mode"],
  [
    "how does X actually work / give me an intuition",
    "prose, then one small Diagram or Structure; a widget when it needs a picture",
  ],
] as const;

export const components = ["Answer", "Diagram", "Structure", "Steps", "Notes"] as const;

export const usage = {
  Answer: "Root container with empty props. List the other elements in reading order.",
  Diagram:
    'Mermaid in source, one statement a line, lines joined with \\n in the JSON string. The app lays it out and colours it, so set no colours: no style, classDef, linkStyle or theme. Mark the one node the question is about with :::accent (or :::positive, :::negative, :::warning when that is its meaning). Labels are at most five words; put a label with punctuation in quotes, A["Ask (once)"], and write a quote inside one as #quot;. Edge labels only where the flow branches. No click, links or images. More than four nodes side by side do not fit: chain them or split the diagram. For a big system, draw the overview first and the detail in a second view.',
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
      type: "Diagram",
      props: {
        source: [
          "flowchart TD",
          "  request[Request arrives] --> cache{In the cache?}:::accent",
          "  cache -->|yes| hit[Return cached copy]",
          '  cache -->|no| origin["Ask the origin<br/>Slow path"]',
          "  origin --> store[Store and return]",
        ].join("\n"),
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
