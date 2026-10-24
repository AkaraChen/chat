import { describe, expect, test } from "bun:test";
import { validateSpec } from "./catalog";
import { searchTemplates, templates } from "./search";

describe("search_templates", () => {
  test("lands on the three templates", () => {
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

  test("works in Chinese", () => {
    expect(searchTemplates("帮我整理这次会议纪要，谁负责什么").template?.id).toBe("meeting");
    expect(searchTemplates("审查 acme/web 的 PR #128").template?.id).toBe("review");
    expect(searchTemplates("把这些通胀和利率数据画成图表").template?.id).toBe("economy");
  });

  test("review is excluded without GitHub", () => {
    const out = searchTemplates("Review acme/web #128", { github: false });
    expect(out.template?.id).not.toBe("review");
  });

  test("detail carries the template name", () => {
    expect(searchTemplates("meeting notes").detail).toEqual({ template: "meeting" });
    expect(searchTemplates("zzz").found).toBe(false);
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

  test("validateSpec reports bad props and wrong root", () => {
    expect(
      validateSpec({ root: "a", elements: { a: { type: "Answer", props: {}, children: [] } } })
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateSpec({
        root: "a",
        elements: { a: { type: "Notes", props: { title: "t", items: ["x"] }, children: [] } },
      }).length,
    ).toBeGreaterThan(0);
  });
});
