import {
  defineCatalog,
  defineSchema,
  getByPath,
  validateSpec as validateStructure,
} from "@json-render/core";
import { z } from "zod";

import { CalcError, calcVariables } from "./calc";

/**
 * Same spec shape as `@json-render/react`'s schema (flat element map), declared
 * here so this file only needs `@json-render/core` and `zod` and can be imported
 * by both the server and the web app.
 */
const schema = defineSchema(
  (s) => ({
    spec: s.object({
      root: s.string(),
      elements: s.record(
        s.object({
          type: s.ref("catalog.components"),
          props: s.propsOf("catalog.components"),
          children: s.array(s.string()),
        }),
      ),
    }),
    catalog: s.object({
      components: s.map({
        props: s.zod(),
        slots: s.array(s.string()),
        description: s.string(),
        example: s.any(),
      }),
      actions: s.map({
        params: s.zod(),
        description: s.string(),
      }),
    }),
  }),
  {
    promptTemplate: ({ catalog: data, formatZodType, options }) => {
      const rules = (options.customRules ?? []).map((rule, i) => `${i + 1}. ${rule}`);
      const components = (
        data as { components: Record<string, { props: z.ZodType; description: string }> }
      ).components;
      const lines = Object.entries(components).map(
        ([name, def]) => `- ${name}: ${formatZodType(def.props)}. ${def.description}`,
      );
      return [
        "SPEC FORMAT (JSONL, RFC 6902 JSON Patch, inside a ```spec fence):",
        "One JSON object per line. First set the root, then add each element. A new /root starts a new view.",
        '{"op":"add","path":"/root","value":"answer"}',
        '{"op":"add","path":"/elements/answer","value":{"type":"Answer","props":{},"children":["notes"]}}',
        '{"op":"add","path":"/elements/notes","value":{"type":"Notes","props":{"title":"...","items":["..."]},"children":[]}}',
        "",
        "COMPONENTS:",
        ...lines,
        ...(rules.length ? ["", "SPEC RULES:", ...rules] : []),
      ].join("\n");
    },
    defaultRules: [],
  },
);

// Expressions an interactive view may put where a value goes. Resolved by the
// renderer against the view's state before the component sees its props.
const EXPRESSION_KEYS = ["$state", "$template", "$cond", "$computed"] as const;

const expression = z
  .looseObject({})
  .refine((value) => EXPRESSION_KEYS.some((key) => key in value), {
    message: "expected a value or a $state, $template, $cond or $computed expression",
  })
  .describe("expression");

/** A literal, or an expression that resolves to one. */
const dynamic = <T extends z.ZodType>(type: T) => z.union([type, expression]);

/** Two-way binding to a path in the view's state. */
const binding = z
  .object({ $bindState: z.string().startsWith("/") })
  .describe('{"$bindState":"/path"}');

export const tones = ["neutral", "accent", "positive", "negative", "warning"] as const;

const tone = z
  .enum(tones)
  .optional()
  .describe("Meaning, not decoration: accent marks the focus; omit for neutral.");

/** At most five words, the budget for a label on a box or node. */
const shortLabel = z
  .string()
  .min(1)
  .refine((value) => value.trim().split(/\s+/).length <= 5 && value.length <= 40, {
    message: "keep it to five words",
  });

const shortDetail = z.string().max(60).optional().describe("One short line under the label.");

export const componentNames = [
  "Answer",
  "LineChart",
  "BarChart",
  "StatStrip",
  "Table",
  "Changes",
  "Diff",
  "Decisions",
  "OpenItems",
  "Todo",
  "Notes",
  "Options",
  "Comparison",
  "Rows",
  "Sources",
  "Flow",
  "Structure",
  "Steps",
  "Record",
  "FollowUps",
  "Panel",
  "Slider",
  "Toggle",
  "Choice",
  "Readouts",
  "Plot",
] as const;

export type ComponentName = (typeof componentNames)[number];

// Answer only holds the view.
export const answerProps = z.object({});

export const lineChartProps = z.object({
  title: z.string(),
  unit: z.string().describe("Unit of the y values, for example %, USD, ms."),
  series: z
    .array(
      z.object({
        name: z.string(),
        points: z.array(z.object({ x: z.string().describe("x label"), y: z.number() })).min(2),
      }),
    )
    .min(1)
    .max(2),
});

export const barChartProps = z.object({
  title: z.string(),
  unit: z.string().describe("Unit of the values, for example %, USD, ms."),
  categories: z.array(z.string()).min(1).max(12),
  series: z
    .array(
      z.object({
        name: z.string(),
        values: z.array(z.number()).min(1).max(12).describe("One value per category, in order."),
      }),
    )
    .min(1)
    .max(2),
  precision: z.number().int().min(0).max(4).optional(),
});

export const statStripProps = z.object({
  cells: z
    .array(
      z.object({
        label: z.string(),
        value: z.string().describe("The big number, already formatted."),
        compare: z.string().describe("One line comparing it to something."),
      }),
    )
    .min(1)
    .max(4),
});

export const tableProps = z.object({
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())),
});

export const changesProps = z.object({
  files: z
    .array(
      z.object({
        path: z.string(),
        additions: z.number().int().nonnegative(),
        deletions: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export const diffProps = z.object({
  file: z.string(),
  startLine: z
    .number()
    .int()
    .positive()
    .describe("Line number in the new file of the first patch line."),
  note: z.string().describe("One sentence on why this hunk matters."),
  patch: z
    .string()
    .describe('Patch text, one line per row, each prefixed with "+", "-" or a space.'),
});

export const decisionsProps = z.object({
  items: z.array(z.string()).min(1),
});

const openCard = z.object({ title: z.string(), detail: z.string() });

export const openItemsProps = z.object({
  groups: z
    .array(
      z.object({
        title: z.string(),
        cards: z.array(openCard).length(2),
      }),
    )
    .length(2),
});

export const todoProps = z.object({
  person: z.string(),
  task: z.string(),
  time: z.string().describe("When it is due, in the user's words."),
});

export const notesProps = z.object({
  title: z.string(),
  items: z.array(z.string()).min(1),
});

export const optionsProps = z.object({
  title: z.string(),
  options: z
    .array(
      z.object({
        name: z.string(),
        summary: z.string().describe("One sentence on what this option gives you."),
        meta: z
          .string()
          .describe("A time, size or cost the answer can support. Say 'not estimated' otherwise."),
        recommended: z
          .boolean()
          .optional()
          .describe("At most one option is recommended; omit or false otherwise."),
      }),
    )
    .min(2)
    .max(3),
});

export const comparisonProps = z.object({
  title: z.string(),
  columns: z
    .array(
      z.object({
        name: z.string(),
        recommended: z
          .boolean()
          .optional()
          .describe("At most one column is recommended; omit or false otherwise."),
      }),
    )
    .min(2)
    .max(3),
  rows: z
    .array(
      z.object({
        criterion: z.string(),
        values: z.array(z.string()).min(2).max(3).describe("One value per column, in order."),
      }),
    )
    .min(1)
    .max(8),
});

export const rowsProps = z.object({
  title: z.string(),
  meta: z.string().optional().describe("A short count or total for the top right."),
  rows: z
    .array(
      z.object({
        label: z.string(),
        value: z
          .string()
          .describe(
            "A word or a short phrase, such as No, Partial or 2–3 weeks. The reasons go in the prose.",
          ),
        status: z
          .enum(["negative", "neutral", "positive"])
          .optional()
          .describe("Only for a verdict. Colours the value and adds a dot."),
      }),
    )
    .min(1)
    .max(8),
});

export const sourcesProps = z.object({
  title: z.string(),
  items: z
    .array(
      z.object({
        title: z.string(),
        source: z.string().describe("The domain, or 'attachment' for a file the user sent."),
        kind: z.enum(["web", "file"]).optional(),
      }),
    )
    .min(1)
    .max(6),
});

export const flowProps = z.object({
  direction: z
    .enum(["down", "right"])
    .optional()
    .describe("down (default) for a sequence, right for a short pipeline of up to four steps."),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        label: shortLabel,
        detail: shortDetail,
        tone,
      }),
    )
    .min(2)
    .max(12),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().max(24).optional().describe("A word or two, such as yes, no, retry."),
      }),
    )
    .min(1)
    .max(16),
});

export type StructureBox = {
  label: string;
  detail?: string;
  tone?: (typeof tones)[number];
  children?: StructureBox[];
};

const structureBox: z.ZodType<StructureBox> = z.lazy(() =>
  z.object({
    label: shortLabel,
    detail: shortDetail,
    tone,
    children: z.array(structureBox).max(4).optional(),
  }),
);

export const structureProps = z.object({
  root: structureBox.describe("The outer box. Nest at most three levels, four boxes per level."),
});

export const stepsProps = z.object({
  mode: z
    .enum(["list", "stepper"])
    .optional()
    .describe("list (default) shows every step; stepper shows one at a time with next/back."),
  steps: z
    .array(
      z.object({
        title: z.string().max(60),
        detail: z.string().max(240).describe("One or two sentences."),
      }),
    )
    .min(2)
    .max(8),
});

export const recordProps = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  fields: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .min(1)
    .max(8),
});

export const followUpsProps = z.object({
  items: z
    .array(
      z.object({
        label: z.string().max(48).describe("What the button says."),
        prompt: z.string().max(280).describe("The message sent as the user's when pressed."),
      }),
    )
    .min(1)
    .max(3),
});

export const panelProps = z.object({
  title: z.string().optional(),
});

export const sliderProps = z.object({
  label: z.string(),
  value: binding,
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  unit: z.string().optional(),
  precision: z.number().int().min(0).max(4).optional(),
});

export const toggleProps = z.object({
  label: z.string(),
  checked: binding,
});

export const choiceProps = z.object({
  label: z.string(),
  value: binding,
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .min(2)
    .max(4),
});

export const readoutsProps = z.object({
  items: z
    .array(
      z.object({
        label: dynamic(z.string()),
        value: dynamic(z.number()),
        unit: z.string().optional(),
        precision: z.number().int().min(0).max(4).optional(),
      }),
    )
    .min(1)
    .max(4),
});

const plotVariable = dynamic(z.union([z.number(), z.boolean()]));

export const plotProps = z.object({
  title: z.string(),
  unit: z.string(),
  x: z.object({
    label: z.string(),
    from: dynamic(z.number()),
    to: dynamic(z.number()),
    samples: z.number().int().min(2).max(60).describe("How many x values to plot."),
  }),
  series: z
    .array(
      z.object({
        name: z.string(),
        expr: z.string().describe("A calc expression in x and the names in vars."),
        vars: z.record(z.string(), plotVariable).optional(),
      }),
    )
    .min(1)
    .max(2),
  precision: z.number().int().min(0).max(4).optional(),
});

const definitions = {
  Answer: {
    props: answerProps,
    slots: ["default"],
    description:
      "Always the root element, with empty props. Put every other component in its children, in reading order.",
  },
  LineChart: {
    props: lineChartProps,
    slots: [],
    description:
      "Line chart with one or two series. Only use numbers that appear in the user's message or in tool results.",
  },
  BarChart: {
    props: barChartProps,
    slots: [],
    description:
      "Horizontal bars comparing up to twelve categories, one or two series. Only use numbers from the user's message or tool results.",
  },
  StatStrip: {
    props: statStripProps,
    slots: [],
    description: "Up to four headline numbers, each with a label and one comparison line.",
  },
  Table: {
    props: tableProps,
    slots: [],
    description: "Plain table. Every row has one string per column.",
  },
  Changes: {
    props: changesProps,
    slots: [],
    description:
      "Changed files of a pull request with added and removed line counts. Counts come from tool results.",
  },
  Diff: {
    props: diffProps,
    slots: [],
    description: "One hunk of a diff with a one-line note. The patch is copied from tool results.",
  },
  Decisions: {
    props: decisionsProps,
    slots: [],
    description: "Things that were decided, one short sentence each.",
  },
  OpenItems: {
    props: openItemsProps,
    slots: [],
    description:
      "Two groups of unresolved questions, each with a title and exactly two small cards.",
  },
  Todo: {
    props: todoProps,
    slots: [],
    description: "One follow-up: who, what, by when. Use one Todo element per follow-up.",
  },
  Notes: {
    props: notesProps,
    slots: [],
    description: "A titled list of short observations.",
  },
  Options: {
    props: optionsProps,
    slots: [],
    description:
      "Two or three options for a choice, each with a one-line summary and a time, size or cost. Mark at most one recommended.",
  },
  Comparison: {
    props: comparisonProps,
    slots: [],
    description:
      "A criteria-by-option matrix. Every row has one short value per column, in the same order. Mark at most one recommended column.",
  },
  Rows: {
    props: rowsProps,
    slots: [],
    description:
      "A titled label/value list. Use for a verdict, what would flip a decision, or the effort of each step. Status is only for a yes/no/partial verdict.",
  },
  Sources: {
    props: sourcesProps,
    slots: [],
    description:
      "The sources the answer actually used, each with a title and a domain or 'attachment'. Never invent a source; leave the element out when there are none.",
  },
  Flow: {
    props: flowProps,
    slots: [],
    description:
      "Boxes and arrows, laid out by the app: steps in order, branches at decisions, data moving between parts. At most four nodes share a rank.",
  },
  Structure: {
    props: structureProps,
    slots: [],
    description: "Boxes inside boxes: what contains what. Up to three levels.",
  },
  Steps: {
    props: stepsProps,
    slots: [],
    description: "A numbered sequence of stages, each with a title and a sentence or two.",
  },
  Record: {
    props: recordProps,
    slots: [],
    description: "One bounded thing (a person, order, service, config) as a card of fields.",
  },
  FollowUps: {
    props: followUpsProps,
    slots: [],
    description:
      "Up to three next questions as buttons. Pressing one sends its prompt as the user's message. Last in the view.",
  },
  Panel: {
    props: panelProps,
    slots: ["default"],
    description:
      "Holds an interactive view: controls first (Slider, Toggle, Choice), then what they change (Readouts, Plot).",
  },
  Slider: {
    props: sliderProps,
    slots: [],
    description: "A number the user drags, bound to state. Shows its value, rounded.",
  },
  Toggle: {
    props: toggleProps,
    slots: [],
    description: "An on/off switch bound to a boolean in state.",
  },
  Choice: {
    props: choiceProps,
    slots: [],
    description: "Two to four mutually exclusive options as a segmented control, bound to state.",
  },
  Readouts: {
    props: readoutsProps,
    slots: [],
    description:
      "Up to four live numbers. value is usually a calc expression over state. The app rounds them.",
  },
  Plot: {
    props: plotProps,
    slots: [],
    description:
      "A line chart computed from a formula: each series' expr is evaluated at evenly spaced x values. vars may read state.",
  },
} satisfies Record<ComponentName, unknown>;

export const catalog = defineCatalog(schema, { components: definitions, actions: {} });

const propsSchemas: Record<ComponentName, z.ZodType> = Object.fromEntries(
  Object.entries(definitions).map(([name, def]) => [name, def.props]),
) as unknown as Record<ComponentName, z.ZodType>;

export type AnswerSpec = typeof catalog._specType & { state?: Record<string, unknown> };

export type ComponentProps = {
  [K in ComponentName]: z.infer<(typeof definitions)[K]["props"]>;
};

/** The components that read state; only an interactive view uses them. */
export const interactiveComponents = [
  "Panel",
  "Slider",
  "Toggle",
  "Choice",
  "Readouts",
  "Plot",
] as const satisfies readonly ComponentName[];

const SPEC_RULES = [
  'Every element has "type", "props" and a "children" array (leaf elements use []). Every key in a children array must exist as its own element.',
  'The root element must be an "Answer". Every other element is listed in the children of that Answer (or of a Panel inside it).',
  "Text fields render inline markdown: **bold**, `code`, and [links](url). Keep each field a sentence. Do not put headings, lists, or tables in a text field.",
  "Do not use on, repeat or watch. State, visible and expressions are only for interactive views.",
];

const INTERACTIVE_RULES = [
  'Interactive views set the state right after the root: {"op":"add","path":"/state","value":{"years":10,"rate":5}}. Every $bindState and $state path must exist in it.',
  'Controls bind with {"$bindState":"/years"}. Values read state with {"$state":"/years"}.',
  'Computed numbers use {"$computed":"calc","args":{"expr":"p * (1 + r / 100) ^ y","p":{"$state":"/principal"},"r":{"$state":"/rate"},"y":{"$state":"/years"}}}. expr may use + - * / % ^, parentheses, min, max, abs, round, floor, ceil, sqrt, pow, log, exp, and only the variables given in args.',
  'Text that reads state uses {"$template":"After ${/years} years"}. An element may carry "visible":{"$state":"/detailed"} (also eq, neq, gt, gte, lt, lte) next to "props".',
];

function catalogFor(names: readonly ComponentName[]) {
  const picked = Object.fromEntries(
    names.filter((name) => name in definitions).map((name) => [name, definitions[name]]),
  );
  return defineCatalog(schema, { components: picked as typeof definitions, actions: {} });
}

/** The spec format with only the given components, and the rules that apply to them. */
export function specPromptFor(names: readonly ComponentName[]): string {
  const wanted = new Set<ComponentName>(["Answer", ...names]);
  const interactive = interactiveComponents.some((name) => wanted.has(name));
  return catalogFor([...wanted]).prompt({
    customRules: interactive ? [...SPEC_RULES, ...INTERACTIVE_RULES] : SPEC_RULES,
  });
}

/** The whole catalog, as one prompt. */
export const specPrompt: string = specPromptFor(componentNames);

// --- Validation -------------------------------------------------------------

type Issue = string;

function walk(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
  else if (value && typeof value === "object") {
    visit(value as Record<string, unknown>);
    Object.values(value).forEach((item) => walk(item, visit));
  }
}

function checkExpressions(
  key: string,
  el: { type: string; props: unknown },
  state: Record<string, unknown> | undefined,
  errors: Issue[],
) {
  const where = `element "${key}" (${el.type})`;
  walk(el.props, (node) => {
    for (const ref of ["$state", "$bindState"] as const) {
      const path = node[ref];
      if (typeof path !== "string") continue;
      if (!state) errors.push(`${where}: ${ref} "${path}" needs a /state for the view`);
      else if (getByPath(state, path) === undefined) {
        errors.push(`${where}: ${ref} "${path}" is not in the view's state`);
      }
    }
    if ("$computed" in node) {
      const name = node.$computed;
      if (name !== "calc" && name !== "format") {
        errors.push(`${where}: $computed must be "calc" or "format", got ${JSON.stringify(name)}`);
        return;
      }
      const args = (node.args ?? {}) as Record<string, unknown>;
      if (name === "calc") {
        if (typeof args.expr !== "string") {
          errors.push(`${where}: calc needs an "expr" string in args`);
          return;
        }
        checkCalc(where, args.expr, Object.keys(args), errors);
      }
    }
  });
}

function checkCalc(where: string, expr: string, names: string[], errors: Issue[]) {
  try {
    for (const variable of calcVariables(expr)) {
      if (!names.includes(variable)) {
        errors.push(`${where}: calc "${expr}" reads "${variable}", which is not given`);
      }
    }
  } catch (error) {
    if (error instanceof CalcError) errors.push(`${where}: calc "${expr}": ${error.message}`);
    else throw error;
  }
}

/** Longest-path ranks of a flow's nodes. Edges that close a loop are left out. */
export function flowRanks(props: ComponentProps["Flow"]): Map<string, number> {
  const ids = props.nodes.map((node) => node.id);
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of props.edges) out.get(edge.from)?.push(edge.to);
  const rank = new Map<string, number>(ids.map((id) => [id, 0]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const order: string[] = [];
  const visit = (id: string) => {
    if (done.has(id) || visiting.has(id)) return;
    visiting.add(id);
    for (const next of out.get(id) ?? []) visit(next);
    visiting.delete(id);
    done.add(id);
    order.push(id);
  };
  const incoming = new Set(props.edges.map((edge) => edge.to));
  ids.filter((id) => !incoming.has(id)).forEach(visit);
  ids.forEach(visit);
  order.reverse();
  const position = new Map(order.map((id, index) => [id, index]));
  for (const id of order) {
    for (const next of out.get(id) ?? []) {
      // Only forward edges in the topological order push a node down.
      if ((position.get(next) ?? 0) > (position.get(id) ?? 0)) {
        rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1));
      }
    }
  }
  return rank;
}

function checkFlow(key: string, props: ComponentProps["Flow"], errors: Issue[]) {
  const where = `element "${key}" (Flow)`;
  const ids = new Set<string>();
  for (const node of props.nodes) {
    if (ids.has(node.id)) errors.push(`${where}: node id "${node.id}" is used twice`);
    ids.add(node.id);
  }
  props.edges.forEach((edge, index) => {
    for (const end of [edge.from, edge.to]) {
      if (!ids.has(end)) errors.push(`${where} edges.${index}: no node "${end}"`);
    }
  });
  if (errors.length) return;
  const perRank = new Map<number, number>();
  for (const rank of flowRanks(props).values()) perRank.set(rank, (perRank.get(rank) ?? 0) + 1);
  for (const [rank, count] of perRank) {
    if (count > 4) {
      errors.push(
        `${where}: ${count} nodes share rank ${rank}; at most four fit side by side, so split the diagram or chain them`,
      );
    }
  }
}

function checkStructure(key: string, box: StructureBox, depth: number, errors: Issue[]) {
  if (depth > 3) {
    errors.push(`element "${key}" (Structure): nest at most three levels`);
    return;
  }
  for (const child of box.children ?? []) checkStructure(key, child, depth + 1, errors);
}

/**
 * Validate one finished view. Returns human-readable errors; an empty array
 * means the view is valid.
 */
export function validateSpec(spec: unknown): string[] {
  const errors: string[] = [];
  const parsed = catalog.validate(spec);
  if (!parsed.success) {
    for (const issue of parsed.error?.issues ?? []) {
      errors.push(`${issue.path.join(".") || "(spec)"}: ${issue.message}`);
    }
    return errors;
  }
  const raw = spec as AnswerSpec;
  const value = parsed.data as AnswerSpec;
  const state = raw.state;
  if (
    state !== undefined &&
    (typeof state !== "object" || state === null || Array.isArray(state))
  ) {
    errors.push("state: must be an object");
  }
  const structure = validateStructure(raw as never);
  for (const issue of structure.issues) {
    if (issue.severity === "error") errors.push(issue.message);
  }
  for (const [key, el] of Object.entries(value.elements)) {
    const element = raw.elements[key] as unknown as Record<string, unknown>;
    for (const field of ["on", "repeat", "watch"]) {
      if (field in element) errors.push(`element "${key}": "${field}" is not supported`);
    }
    if ("visible" in element && !state) {
      errors.push(`element "${key}": "visible" needs a /state for the view`);
    }
    const type = el.type as ComponentName;
    const result = propsSchemas[type]?.safeParse(el.props);
    if (result && !result.success) {
      for (const issue of result.error.issues) {
        errors.push(`element "${key}" (${type}) props.${issue.path.join(".")}: ${issue.message}`);
      }
      continue;
    }
    checkExpressions(key, { type, props: el.props }, state, errors);
    if (!result) continue;
    if (type === "Options") {
      const props = result.data as ComponentProps["Options"];
      const marked = props.options.filter((option) => option.recommended).length;
      if (marked > 1) {
        errors.push(
          `element "${key}" (Options) props.options: mark at most one option recommended, got ${marked}`,
        );
      }
    }
    if (type === "Comparison") {
      const props = result.data as ComponentProps["Comparison"];
      const marked = props.columns.filter((column) => column.recommended).length;
      if (marked > 1) {
        errors.push(
          `element "${key}" (Comparison) props.columns: mark at most one column recommended, got ${marked}`,
        );
      }
      props.rows.forEach((row, index) => {
        if (row.values.length !== props.columns.length) {
          errors.push(
            `element "${key}" (Comparison) props.rows.${index}.values: expected ${props.columns.length} values, got ${row.values.length}`,
          );
        }
      });
    }
    if (type === "BarChart") {
      const props = result.data as ComponentProps["BarChart"];
      props.series.forEach((series, index) => {
        if (series.values.length !== props.categories.length) {
          errors.push(
            `element "${key}" (BarChart) props.series.${index}.values: expected ${props.categories.length} values, got ${series.values.length}`,
          );
        }
      });
    }
    if (type === "Flow") checkFlow(key, result.data as ComponentProps["Flow"], errors);
    if (type === "Structure") {
      checkStructure(key, (result.data as ComponentProps["Structure"]).root, 1, errors);
    }
    if (type === "Plot") {
      const props = result.data as ComponentProps["Plot"];
      props.series.forEach((series) => {
        checkCalc(
          `element "${key}" (Plot) series "${series.name}"`,
          series.expr,
          ["x", ...Object.keys(series.vars ?? {})],
          errors,
        );
      });
    }
  }
  const root = value.elements[value.root];
  if (root && (root.type as string) !== "Answer") {
    errors.push(`root element "${value.root}" must be an Answer, got ${String(root.type)}`);
  }
  for (const [key, el] of Object.entries(value.elements)) {
    if (key !== value.root && (el.type as string) === "Answer") {
      errors.push(`element "${key}": Answer may only be the root`);
    }
  }
  return errors;
}
