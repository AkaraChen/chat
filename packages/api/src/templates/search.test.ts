import { describe, expect, test } from "bun:test";
import { validateSpec } from "./catalog";
import { searchTemplates, templates } from "./search";

describe("search_templates", () => {
  test("lands on the core templates", () => {
    expect(
      searchTemplates("Summarize the decisions and owners from today's meeting notes").template?.id,
    ).toBe("meeting");
    expect(searchTemplates("Review acme/web #128 and tell me what is risky").template?.id).toBe(
      "review",
    );
    expect(
      searchTemplates("Chart the inflation and interest rate figures below: 3.9, 3.4, 3.0").template
        ?.id,
    ).toBe("economy");
  });

  test("lands on the technical templates", () => {
    expect(
      searchTemplates("Should we use Electron or fork Chromium for our browser?").template?.id,
    ).toBe("tech-choice");
    expect(searchTemplates("定制浏览器走 electron 还是走 fork chromium").template?.id).toBe(
      "tech-choice",
    );
    expect(searchTemplates("WPE 支持 safari extension 吗").template?.id).toBe("capability-check");
    expect(searchTemplates("Does WPE support Safari WebExtensions?").template?.id).toBe(
      "capability-check",
    );
  });

  test("works in Chinese", () => {
    expect(searchTemplates("帮我整理这次会议纪要，谁负责什么").template?.id).toBe("meeting");
    expect(searchTemplates("审查 acme/web 的 PR #128").template?.id).toBe("review");
    expect(searchTemplates("把这些通胀和利率数据画成图表").template?.id).toBe("economy");
  });

  test("review is excluded without GitHub", () => {
    const out = searchTemplates("Review acme/web #128", { github: false });
    expect(out.template?.id).not.toBe("review");
  });

  test("detail carries the template name, and every result carries the spec guide", () => {
    expect(searchTemplates("meeting notes").detail).toEqual({ template: "meeting" });
    expect(searchTemplates("zzz").found).toBe(false);
    for (const query of ["meeting notes", "zzz"]) {
      const { guide } = searchTemplates(query);
      expect(guide).toContain("AVAILABLE COMPONENTS");
      expect(guide).toContain("```spec");
    }
  });

  test("every example validates and only uses allowed components", () => {
    for (const t of templates) {
      expect(validateSpec(t.example)).toEqual([]);
      for (const el of Object.values(t.example.elements)) {
        expect(t.components).toContain(el.type as never);
      }
      expect(t.when).toContain("placeholders");
    }
  });

  test("technical components check their shape", () => {
    const specWith = (elements: Record<string, unknown>) => ({
      root: "a",
      elements: {
        a: { type: "Answer", props: {}, children: Object.keys(elements) },
        ...elements,
      },
    });
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
    expect(validateSpec(specWith({ options: options([false, false]) }))).toEqual([]);
    expect(validateSpec(specWith({ options: options([true, false]) }))).toEqual([]);
    expect(validateSpec(specWith({ comparison: comparison([["one"]]) })).length).toBeGreaterThan(0);
    expect(validateSpec(specWith({ comparison: comparison([["one", "two"]]) }))).toEqual([]);
  });

  test("validateSpec reports bad props and wrong root", () => {
    expect(
      validateSpec({ root: "a", elements: { a: { type: "Answer", props: {}, children: [] } } }),
    ).toEqual([]);
    expect(
      validateSpec({ root: "a", elements: { a: { type: "Answer", props: {}, children: ["b"] } } })
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateSpec({
        root: "a",
        elements: {
          a: { type: "Answer", props: {}, children: ["b"] },
          b: { type: "Notes", props: { title: "t", items: [] }, children: [] },
        },
      }).length,
    ).toBeGreaterThan(0);
    expect(
      validateSpec({
        root: "a",
        elements: { a: { type: "Notes", props: { title: "t", items: ["x"] }, children: [] } },
      }).length,
    ).toBeGreaterThan(0);
  });
});
