import { defineCatalog, defineSchema, validateSpec as validateStructure } from "@json-render/core";
import { z } from "zod";

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
      const rules = [
        "RULES:",
        ...(options.customRules ?? []).map((rule, i) => `${i + 1}. ${rule}`),
      ];
      const components = (
        data as { components: Record<string, { props: z.ZodType; description: string }> }
      ).components;
      const lines = Object.entries(components).map(
        ([name, def]) => `- ${name}: ${formatZodType(def.props)}. ${def.description}`,
      );
      return [
        options.system ?? "You answer by emitting a json-render spec.",
        "",
        "SPEC FORMAT (JSONL, RFC 6902 JSON Patch, inside a ```spec fence):",
        "One JSON object per line. First set the root, then add each element.",
        '{"op":"add","path":"/root","value":"answer"}',
        '{"op":"add","path":"/elements/answer","value":{"type":"Answer","props":{},"children":["todo-1"]}}',
        '{"op":"add","path":"/elements/todo-1","value":{"type":"Todo","props":{"person":"...","task":"...","time":"..."},"children":[]}}',
        "",
        "AVAILABLE COMPONENTS:",
        ...lines,
        "",
        ...rules,
      ].join("\n");
    },
    defaultRules: [],
  },
);

export const componentNames = [
  "Answer",
  "LineChart",
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

export const catalog = defineCatalog(schema, {
  components: {
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
      description:
        "One hunk of a diff with a one-line note. The patch is copied from tool results.",
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
  },
  actions: {},
});

const propsSchemas: Record<ComponentName, z.ZodType> = {
  Answer: answerProps,
  LineChart: lineChartProps,
  StatStrip: statStripProps,
  Table: tableProps,
  Changes: changesProps,
  Diff: diffProps,
  Decisions: decisionsProps,
  OpenItems: openItemsProps,
  Todo: todoProps,
  Notes: notesProps,
  Options: optionsProps,
  Comparison: comparisonProps,
  Rows: rowsProps,
  Sources: sourcesProps,
};

export type AnswerSpec = typeof catalog._specType;

export type ComponentProps = {
  Answer: z.infer<typeof answerProps>;
  LineChart: z.infer<typeof lineChartProps>;
  StatStrip: z.infer<typeof statStripProps>;
  Table: z.infer<typeof tableProps>;
  Changes: z.infer<typeof changesProps>;
  Diff: z.infer<typeof diffProps>;
  Decisions: z.infer<typeof decisionsProps>;
  OpenItems: z.infer<typeof openItemsProps>;
  Todo: z.infer<typeof todoProps>;
  Notes: z.infer<typeof notesProps>;
  Options: z.infer<typeof optionsProps>;
  Comparison: z.infer<typeof comparisonProps>;
  Rows: z.infer<typeof rowsProps>;
  Sources: z.infer<typeof sourcesProps>;
};

/** The components and spec rules. search_templates returns this. */
export const specPrompt: string = catalog.prompt({
  system: "How to write the view.",
  customRules: [
    'Every element has "type", "props" and a "children" array (leaf elements use []). Every key in a children array must exist as its own element. Do not use state, repeat, visible or on.',
    'The root element must be an "Answer". Every other element is listed in the children of that Answer.',
    "Numbers may only come from tool results or from the user's own text. Never invent numbers to fill a chart or table; if data is missing, say so in the prose and write no fence.",
    "Text fields render inline markdown: **bold**, `code`, and [links](url). Keep each field a sentence. Do not put headings, lists, or tables in a text field.",
    "Options must mark at most one recommended option; Comparison must mark at most one recommended column, and every row needs one value per column.",
    "Sources may only list a source that appears in tool results or is the user's attachment. Omit Sources when there are none.",
  ],
});

/**
 * Validate a finished spec. Returns human-readable errors; an empty array
 * means the spec is valid.
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
  const value = parsed.data as AnswerSpec;
  const structure = validateStructure(value as never);
  for (const issue of structure.issues) {
    if (issue.severity === "error") errors.push(issue.message);
  }
  for (const [key, el] of Object.entries(value.elements)) {
    const result = propsSchemas[el.type as ComponentName]?.safeParse(el.props);
    if (result && !result.success) {
      for (const issue of result.error.issues) {
        errors.push(
          `element "${key}" (${String(el.type)}) props.${issue.path.join(".")}: ${issue.message}`,
        );
      }
    }
    if (result?.success && el.type === "Options") {
      const props = result.data as z.infer<typeof optionsProps>;
      const marked = props.options.filter((option) => option.recommended).length;
      if (marked > 1) {
        errors.push(
          `element "${key}" (Options) props.options: mark at most one option recommended, got ${marked}`,
        );
      }
    }
    if (result?.success && el.type === "Comparison") {
      const props = result.data as z.infer<typeof comparisonProps>;
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
