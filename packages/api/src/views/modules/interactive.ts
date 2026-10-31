import type { ViewModule } from "../types";

export const id = "interactive" as const;

export const summary =
  "try values and see what changes: rates, sizes, what-ifs, how a formula behaves";

export const when =
  "Use when the answer depends on a few numbers the user may want to change: a calculation, a what-if, how a quantity grows or trades off against another. The app does the arithmetic as the user moves a control, so nothing goes back to the model. Start every control at a sensible value from the user's message, or at a typical value that the prose names. Prose: the answer at the starting values, then what to try.";

export const routes = [
  [
    "how much will I have after N years at R%",
    "Slider for each input, Readouts for the result, Plot of the balance over time",
  ],
  ["what if I change X", "a Slider for X and Readouts for what it changes"],
  ["how does this formula behave", "Sliders for its parameters and a Plot over its input"],
  [
    "compare two modes (monthly or yearly, with or without)",
    "Choice or Toggle feeding the same calc",
  ],
] as const;

export const components = [
  "Answer",
  "Panel",
  "Slider",
  "Toggle",
  "Choice",
  "Readouts",
  "Plot",
] as const;

export const usage = {
  Answer: "Root container with empty props. Holds the Panel.",
  Panel:
    "One per view. Children in order: the controls, then Readouts, then Plot. Title only when the prose does not already name it.",
  Slider:
    "Bound to a number in state. Choose min, max and step so every value makes sense; set precision to match step.",
  Toggle: "Bound to a boolean in state. Read it in calc as 1 or 0.",
  Choice:
    'Bound to a string in state. In calc, compare with $cond, for example {"$cond":{"$state":"/mode","eq":"monthly"},"$then":12,"$else":1}.',
  Readouts:
    "At most four results. value is a calc over state. Give the unit and the precision; the app rounds.",
  Plot: "One or two curves over a range of x. expr uses x and the vars, which may read state. samples between 20 and 40 draws a smooth line.",
} as const;

export const example: ViewModule["example"] = {
  root: "answer",
  state: { principal: 1000, rate: 5, years: 20 },
  elements: {
    answer: { type: "Answer", props: {}, children: ["panel"] },
    panel: {
      type: "Panel",
      props: {},
      children: ["principal", "rate", "years", "result", "curve"],
    },
    principal: {
      type: "Slider",
      props: {
        label: "Starting amount",
        value: { $bindState: "/principal" },
        min: 100,
        max: 10000,
        step: 100,
        unit: "$",
      },
      children: [],
    },
    rate: {
      type: "Slider",
      props: {
        label: "Yearly rate",
        value: { $bindState: "/rate" },
        min: 0,
        max: 15,
        step: 0.5,
        unit: "%",
        precision: 1,
      },
      children: [],
    },
    years: {
      type: "Slider",
      props: { label: "Years", value: { $bindState: "/years" }, min: 1, max: 40, step: 1 },
      children: [],
    },
    result: {
      type: "Readouts",
      props: {
        items: [
          {
            label: { $template: "After ${/years} years" },
            value: {
              $computed: "calc",
              args: {
                expr: "p * (1 + r / 100) ^ y",
                p: { $state: "/principal" },
                r: { $state: "/rate" },
                y: { $state: "/years" },
              },
            },
            unit: "$",
          },
        ],
      },
      children: [],
    },
    curve: {
      type: "Plot",
      props: {
        title: "Balance",
        unit: "$",
        x: { label: "Year", from: 0, to: { $state: "/years" }, samples: 30 },
        series: [
          {
            name: "Balance",
            expr: "p * (1 + r / 100) ^ x",
            vars: { p: { $state: "/principal" }, r: { $state: "/rate" } },
          },
        ],
      },
      children: [],
    },
  },
};

export const interactive: ViewModule = { id, summary, when, routes, components, usage, example };
