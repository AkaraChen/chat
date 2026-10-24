import { describe, expect, test } from "bun:test";

import {
  cleanTitle,
  enqueueThreadTitle,
  generateThreadTitle,
  textOfParts,
  type ThreadTitleDeps,
} from "./thread-title";

const parts = JSON.stringify([
  { type: "step-start" },
  { type: "text", text: "PR looks good" },
  { type: "data-spec", data: { type: "patch", patch: { op: "add", path: "/root", value: "a" } } },
  { type: "text", text: " Ship it. " },
]);

function deps(overrides: Partial<ThreadTitleDeps> = {}) {
  const saved: { id: string; title: string; at: Date }[] = [];
  const prompts: { model: unknown; prompt: string }[] = [];
  const d: ThreadTitleDeps = {
    loadSource: async () => ({
      userText: "帮我审查 PR",
      assistant: { text: textOfParts(parts), connectionId: "claude-1", modelId: "m" },
    }),
    generate: async (model, prompt) => {
      prompts.push({ model, prompt });
      return '"审查 PR 的结论。"';
    },
    saveTitle: async (id, title, at) => void saved.push({ id, title, at }),
    ...overrides,
  };
  return { d, saved, prompts };
}

describe("thread title", () => {
  test("enqueues with dedupe and retry options", async () => {
    const calls: unknown[][] = [];
    await enqueueThreadTitle(
      { add: (async (...a: unknown[]) => void calls.push(a)) as never },
      "t1",
    );
    expect(calls[0]).toMatchObject([
      "title",
      { threadId: "t1" },
      { jobId: "t1", attempts: 3, backoff: { type: "exponential" } },
    ]);
  });

  test("reads the prose from stored parts and tolerates bad JSON", () => {
    expect(textOfParts(parts)).toBe("PR looks good\n\nShip it.");
    expect(textOfParts("nope")).toBe("");
    expect(textOfParts("{}")).toBe("");
    expect(textOfParts("[null]")).toBe("");
  });

  test("cleans model output", () => {
    expect(cleanTitle('  "Fix login bug."\nmore')).toBe("Fix login bug");
    expect(cleanTitle("标题：「会议纪要。」")).toBe("会议纪要");
    expect(Array.from(cleanTitle("a".repeat(50))).length).toBe(30);
  });

  test("generates and saves title with the message's model", async () => {
    const { d, saved, prompts } = deps();
    expect(await generateThreadTitle(d, "t1")).toBe("审查 PR 的结论");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: "t1", title: "审查 PR 的结论" });
    expect(saved[0]!.at).toBeInstanceOf(Date);
    expect(prompts[0]!.model).toEqual({ connectionId: "claude-1", modelId: "m" });
    expect(prompts[0]!.prompt).toContain("PR looks good");
    expect(prompts[0]!.prompt).toContain("帮我审查 PR");
  });

  test("failure throws and writes nothing", async () => {
    const { d, saved } = deps({
      generate: async () => {
        throw new Error("proxy down");
      },
    });
    await expect(generateThreadTitle(d, "t1")).rejects.toThrow("proxy down");
    expect(saved).toHaveLength(0);
  });

  test("empty output throws", async () => {
    const { d, saved } = deps({ generate: async () => '  ""  ' });
    await expect(generateThreadTitle(d, "t1")).rejects.toThrow();
    expect(saved).toHaveLength(0);
  });

  test("missing thread is a no-op", async () => {
    const { d, saved } = deps({ loadSource: async () => null });
    expect(await generateThreadTitle(d, "t1")).toBeNull();
    expect(saved).toHaveLength(0);
  });
});
