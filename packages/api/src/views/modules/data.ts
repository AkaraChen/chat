import type { ViewModule } from "../types";

export const id = "data" as const;

export const summary = "read a set of numbers: trends, comparisons, breakdowns";

export const when =
  "Use when the answer rests on a set of numbers the user gave or a tool returned and they read better laid out. If there are no numbers, draw nothing and say in the prose that the data is missing. Prose: what the numbers show, in one sentence, and where they come from.";

export const routes = [
  ["how has X changed over time", "LineChart, with StatStrip for the latest, high, low and change"],
  ["compare X across A, B, C", "BarChart"],
  ["break this down / which is largest", "BarChart sorted largest first"],
  ["give me the figures", "Table"],
  ["the key numbers", "StatStrip"],
] as const;

export const components = ["Answer", "LineChart", "BarChart", "StatStrip", "Table"] as const;

export const usage = {
  Answer: "Root container with empty props. List the other elements in reading order.",
  LineChart:
    "One or two series over the same x labels, taken from the numbers in the message. Unit is the unit the user used.",
  StatStrip:
    "Up to four headline numbers (latest, high, low, change). Each compare line says what it is measured against.",
  Table: "The same numbers as rows, one string per column, formatted as the user wrote them.",
  BarChart:
    "Categories that are compared rather than ordered in time. Sort largest first unless the order means something.",
} as const;

export const example: ViewModule["example"] = {
  root: "answer",
  elements: {
    answer: {
      type: "Answer",
      props: {},
      children: ["chart", "stats", "table"],
    },
    chart: {
      type: "LineChart",
      props: {
        title: "Inflation and policy rate",
        unit: "%",
        series: [
          {
            name: "Inflation",
            points: [
              { x: "Q1", y: 3.9 },
              { x: "Q2", y: 3.4 },
              { x: "Q3", y: 3.0 },
              { x: "Q4", y: 2.7 },
            ],
          },
          {
            name: "Policy rate",
            points: [
              { x: "Q1", y: 4.5 },
              { x: "Q2", y: 4.5 },
              { x: "Q3", y: 4.25 },
              { x: "Q4", y: 4.0 },
            ],
          },
        ],
      },
      children: [],
    },
    stats: {
      type: "StatStrip",
      props: {
        cells: [
          { label: "Inflation", value: "2.7%", compare: "down 1.2 points since Q1" },
          { label: "Policy rate", value: "4.0%", compare: "down 0.5 points since Q1" },
          { label: "Real rate", value: "1.3%", compare: "up 0.7 points since Q1" },
        ],
      },
      children: [],
    },
    table: {
      type: "Table",
      props: {
        columns: ["Quarter", "Inflation", "Policy rate"],
        rows: [
          ["Q1", "3.9%", "4.5%"],
          ["Q2", "3.4%", "4.5%"],
          ["Q3", "3.0%", "4.25%"],
          ["Q4", "2.7%", "4.0%"],
        ],
      },
      children: [],
    },
  },
};

export const data: ViewModule = { id, summary, when, routes, components, usage, example };
