import { describe, expect, test } from "bun:test";

import { calc, calcVariables, formatNumber } from "./calc";
import { flowRanks, specPromptFor, validateSpec } from "./catalog";
import { availableModules, loadedWidget, modules, readMe, toJsonl } from "./read-me";

const specWith = (elements: Record<string, unknown>, state?: Record<string, unknown>) => ({
  root: "a",
  ...(state ? { state } : {}),
  elements: {
    a: { type: "Answer", props: {}, children: Object.keys(elements) },
    ...elements,
  },
});

describe("read_me", () => {
  test("returns the shared rules, the modules asked for, and only their components", () => {
    const { guide, detail } = readMe(["explain"]);
    expect(detail).toEqual({ modules: "explain" });
    expect(guide).toContain("# Laying out an answer");
    expect(guide).toContain("## Module: explain");
    expect(guide).toContain("- Flow:");
    expect(guide).toContain("- FollowUps:");
    expect(guide).not.toContain("- Slider:");
    expect(guide).not.toContain("- Diff:");
    expect(guide).toContain("```spec");
  });

  test("loads several modules, skips unknown ones, and leaves out code without GitHub", () => {
    expect(readMe(["data", "explain", "nope"]).detail.modules).toBe("data, explain");
    expect(readMe(["code"], { github: false }).detail.modules).toBe("");
    expect(readMe(["code"], { github: false }).guide).toContain("Answer in prose");
    expect(availableModules({ github: false })).not.toContain("code");
    expect(availableModules()).toContain("code");
  });

  test("the interactive module brings the state rules; others do not", () => {
    expect(readMe(["interactive"]).guide).toContain("$bindState");
    expect(readMe(["compare"]).guide).not.toContain("$bindState");
  });

  test("the widget module alone has no spec format", () => {
    const { guide } = readMe(["widget"]);
    expect(guide).toContain("show_widget");
    expect(guide).not.toContain("SPEC FORMAT");
  });

  test("every example validates and only uses its module's components", () => {
    for (const module of Object.values(modules)) {
      if (!module.example) continue;
      expect([module.id, validateSpec(module.example)]).toEqual([module.id, []]);
      for (const el of Object.values(module.example.elements)) {
        expect([...module.components, "Sources", "FollowUps"]).toContain(el.type as never);
      }
    }
  });

  test("examples are written as patches with the root first and state second", () => {
    const lines = toJsonl(modules.interactive.example!).split("\n");
    expect(JSON.parse(lines[0]!)).toEqual({ op: "add", path: "/root", value: "answer" });
    expect(JSON.parse(lines[1]!).path).toBe("/state");
    expect(lines.length).toBe(2 + Object.keys(modules.interactive.example!.elements).length);
  });

  test("show_widget is offered only after read_me loaded the widget module", () => {
    const call = (modules: string[]) => ({
      toolCalls: [{ toolName: "read_me", input: { modules } }],
    });
    expect(loadedWidget([])).toBe(false);
    expect(loadedWidget([call(["explain"])])).toBe(false);
    expect(loadedWidget([call(["explain"]), call(["widget"])])).toBe(true);
  });

  test("the spec prompt lists only the components it is given", () => {
    const prompt = specPromptFor(["Rows"]);
    expect(prompt).toContain("- Rows:");
    expect(prompt).toContain("- Answer:");
    expect(prompt).not.toContain("- Notes:");
  });
});

describe("calc", () => {
  test("follows precedence, power and functions", () => {
    expect(calc("1 + 2 * 3", {})).toBe(7);
    expect(calc("2 ^ 3 ^ 2", {})).toBe(512);
    expect(calc("2 ** 3", {})).toBe(8);
    expect(calc("-2 ^ 2", {})).toBe(-4);
    expect(calc("(1 + 2) * 3", {})).toBe(9);
    expect(calc("max(1, 5, 3) + round(2.345, 2)", {})).toBe(7.35);
    expect(calc("p * (1 + r / 100) ^ y", { p: 1000, r: 5, y: 2 })).toBeCloseTo(1102.5);
    expect(calc("on * 10", { on: true })).toBe(10);
  });

  test("returns NaN instead of throwing", () => {
    expect(calc("1 / 0", {})).toBeNaN();
    expect(calc("x +", { x: 1 })).toBeNaN();
    expect(calc("y", {})).toBeNaN();
    expect(calc("alert(1)", {})).toBeNaN();
    expect(calc("constructor", {})).toBeNaN();
  });

  test("lists the variables an expression reads", () => {
    expect(calcVariables("a * b + max(a, c)").sort()).toEqual(["a", "b", "c"]);
    expect(() => calcVariables("a +")).toThrow();
  });

  test("formats rounded numbers with a unit", () => {
    expect(formatNumber(0.1 + 0.2, 2)).toBe("0.30");
    expect(formatNumber(3870.4, 0, "$")).toBe("$3,870");
    expect(formatNumber(12.345, 1, "%")).toBe("12.3%");
    expect(formatNumber(5, 0, "ms")).toBe("5 ms");
    expect(formatNumber(Number.NaN)).toBe("—");
  });
});

describe("validateSpec", () => {
  test("reports bad props and a wrong root", () => {
    expect(
      validateSpec({ root: "a", elements: { a: { type: "Answer", props: {}, children: [] } } }),
    ).toEqual([]);
    expect(
      validateSpec({ root: "a", elements: { a: { type: "Answer", props: {}, children: ["b"] } } })
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateSpec(
        specWith({ b: { type: "Notes", props: { title: "t", items: [] }, children: [] } }),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateSpec({
        root: "a",
        elements: { a: { type: "Notes", props: { title: "t", items: ["x"] }, children: [] } },
      }).length,
    ).toBeGreaterThan(0);
  });

  test("Options and Comparison mark at most one recommendation and fill every cell", () => {
    const options = (recommended: boolean[]) => ({
      type: "Options",
      props: {
        title: "The call",
        options: recommended.map((value, index) => ({
          name: `Option ${index}`,
          summary: "One sentence.",
          meta: "not estimated",
          recommended: value,
        })),
      },
      children: [],
    });
    const comparison = (values: string[][]) => ({
      type: "Comparison",
      props: {
        title: "Side by side",
        columns: [
          { name: "A", recommended: true },
          { name: "B", recommended: false },
        ],
        rows: values.map((row, index) => ({ criterion: `Criterion ${index}`, values: row })),
      },
      children: [],
    });
    expect(validateSpec(specWith({ options: options([true, true]) })).length).toBeGreaterThan(0);
    expect(validateSpec(specWith({ options: options([true, false]) }))).toEqual([]);
    expect(validateSpec(specWith({ comparison: comparison([["one"]]) })).length).toBeGreaterThan(0);
    expect(validateSpec(specWith({ comparison: comparison([["one", "two"]]) }))).toEqual([]);
  });

  test("Flow needs real ends, five-word labels and at most four nodes a rank", () => {
    const flow = (nodes: string[], edges: [string, string][], label = "Step") => ({
      type: "Flow",
      props: {
        nodes: nodes.map((id) => ({ id, label })),
        edges: edges.map(([from, to]) => ({ from, to })),
      },
      children: [],
    });
    expect(validateSpec(specWith({ f: flow(["a", "b"], [["a", "b"]]) }))).toEqual([]);
    expect(validateSpec(specWith({ f: flow(["a", "b"], [["a", "c"]]) })).join()).toContain(
      'no node "c"',
    );
    expect(
      validateSpec(specWith({ f: flow(["a", "b"], [["a", "b"]], "one two three four five six") }))
        .length,
    ).toBeGreaterThan(0);
    const wide = flow(
      ["s", "1", "2", "3", "4", "5"],
      ["1", "2", "3", "4", "5"].map((id) => ["s", id] as [string, string]),
    );
    expect(validateSpec(specWith({ f: wide })).join()).toContain("at most four");
    // A loop back does not push the start down.
    const loop = flow(
      ["a", "b", "c"],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "a"],
      ],
    );
    expect(validateSpec(specWith({ f: loop }))).toEqual([]);
    expect(flowRanks(loop.props as never).get("a")).toBe(0);
    expect(flowRanks(loop.props as never).get("c")).toBe(2);
  });

  test("Structure nests at most three levels", () => {
    const box = (depth: number): Record<string, unknown> => ({
      label: `Level ${depth}`,
      ...(depth > 1 ? { children: [box(depth - 1)] } : {}),
    });
    const structure = (depth: number) => ({
      type: "Structure",
      props: { root: box(depth) },
      children: [],
    });
    expect(validateSpec(specWith({ s: structure(3) }))).toEqual([]);
    expect(validateSpec(specWith({ s: structure(4) })).join()).toContain("three levels");
  });

  test("BarChart needs one value per category", () => {
    const bars = (values: number[]) => ({
      type: "BarChart",
      props: { title: "t", unit: "ms", categories: ["a", "b"], series: [{ name: "s", values }] },
      children: [],
    });
    expect(validateSpec(specWith({ b: bars([1, 2]) }))).toEqual([]);
    expect(validateSpec(specWith({ b: bars([1]) })).length).toBeGreaterThan(0);
  });

  test("state paths must exist, calc must parse and read only what it is given", () => {
    const slider = {
      type: "Slider",
      props: { label: "n", value: { $bindState: "/n" }, min: 0, max: 10, step: 1 },
      children: [],
    };
    const readout = (expr: string, args: Record<string, unknown>) => ({
      type: "Readouts",
      props: {
        items: [{ label: "Result", value: { $computed: "calc", args: { expr, ...args } } }],
      },
      children: [],
    });
    const ok = specWith({ s: slider, r: readout("n * 2", { n: { $state: "/n" } }) }, { n: 1 });
    expect(validateSpec(ok)).toEqual([]);
    expect(validateSpec(specWith({ s: slider })).join()).toContain("needs a /state");
    expect(validateSpec(specWith({ s: slider }, { m: 1 })).join()).toContain("not in the view");
    expect(
      validateSpec(specWith({ r: readout("n * k", { n: { $state: "/n" } }) }, { n: 1 })).join(),
    ).toContain('reads "k"');
    expect(
      validateSpec(specWith({ r: readout("n *", { n: { $state: "/n" } }) }, { n: 1 })).length,
    ).toBeGreaterThan(0);
  });

  test("expressions stay out of non-interactive components, and on/repeat/watch are refused", () => {
    expect(
      validateSpec(
        specWith(
          { n: { type: "Notes", props: { title: { $state: "/t" }, items: ["x"] }, children: [] } },
          { t: "x" },
        ),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateSpec(
        specWith({
          n: {
            type: "Notes",
            props: { title: "t", items: ["x"] },
            children: [],
            on: { press: { action: "setState", params: {} } },
          },
        }),
      ).join(),
    ).toContain('"on" is not supported');
  });

  test("Plot expressions read x and their vars", () => {
    const plot = (expr: string) => ({
      type: "Plot",
      props: {
        title: "t",
        unit: "",
        x: { label: "x", from: 0, to: 10, samples: 10 },
        series: [{ name: "s", expr, vars: { k: 2 } }],
      },
      children: [],
    });
    expect(validateSpec(specWith({ p: plot("k * x") }))).toEqual([]);
    expect(validateSpec(specWith({ p: plot("k * z") })).join()).toContain('reads "z"');
  });
});
