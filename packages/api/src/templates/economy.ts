import type { Template } from "./types";
import { PLACEHOLDER_NOTE } from "./types";

export const id = "economy" as const;

export const when = `Use when the user's message already contains a set of numbers (rates, prices, indicators over time) and wants them laid out as a chart and a table. If the message has no numbers, draw nothing and say in the Answer that the data is missing. ${PLACEHOLDER_NOTE}`;

export const components = ["Answer", "LineChart", "StatStrip", "Table"] as const;

export const usage = {
  Answer:
    "Root. Lead: what the numbers show in one sentence. Source: say they come from the user's message.",
  LineChart:
    "One or two series over the same x labels, taken from the numbers in the message. Unit is the unit the user used.",
  StatStrip:
    "Up to four headline numbers (latest, high, low, change). Each compare line says what it is measured against.",
  Table: "The same numbers as rows, one string per column, formatted as the user wrote them.",
} as const;

export const example: Template["example"] = {
  root: "answer",
  elements: {
    answer: {
      type: "Answer",
      props: {
        lead: "Inflation cooled over the year while the policy rate stayed above it.",
        source: "From the figures in your message",
      },
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

export const terms = [
  "economy",
  "economic",
  "inflation",
  "gdp",
  "rate",
  "interest",
  "cpi",
  "unemployment",
  "price",
  "chart",
  "trend",
  "quarter",
  "yield",
  "growth",
  "table",
  "经济",
  "通胀",
  "利率",
  "增长",
  "失业",
  "物价",
  "走势",
  "图表",
  "季度",
  "同比",
  "环比",
  "汇率",
] as const;

export const economy: Template = { id, when, components, usage, example, terms };
