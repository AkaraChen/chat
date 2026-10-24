import type { Template } from "./types";
import { PLACEHOLDER_NOTE } from "./types";

export const id = "review" as const;

export const when = `Use when the user gives a repository and a pull request number and asks for a review, a summary or the risks, and the GitHub tools are available. Fetch the pull request first. ${PLACEHOLDER_NOTE}`;

export const components = ["Answer", "Changes", "Diff", "Notes"] as const;

export const prose =
  "The verdict in one sentence, then the repo, number and what was read (files, diff, CI, comments).";

export const usage = {
  Answer: "Root container with empty props. List the other elements in reading order.",
  Changes:
    "Files from get_pull_request_files with their real additions and deletions. List the largest few if there are many.",
  Diff: "The one hunk that matters most, copied from get_pull_request_diff. startLine is the new-file line of the first patch line. Note: one sentence on why it matters.",
  Notes: "Short observations such as CI status or unresolved comments, only from tool results.",
} as const;

export const example: Template["example"] = {
  root: "answer",
  elements: {
    answer: {
      type: "Answer",
      props: {},
      children: ["changes", "diff", "notes"],
    },
    changes: {
      type: "Changes",
      props: {
        files: [
          { path: "src/client/retry.ts", additions: 42, deletions: 8 },
          { path: "src/client/index.ts", additions: 6, deletions: 2 },
          { path: "src/client/retry.test.ts", additions: 30, deletions: 0 },
        ],
      },
      children: [],
    },
    diff: {
      type: "Diff",
      props: {
        file: "src/client/retry.ts",
        startLine: 21,
        note: "The loop retries forever when the server keeps answering 503.",
        patch: [
          " export async function withRetry<T>(run: () => Promise<T>) {",
          "-  return run();",
          "+  for (;;) {",
          "+    try {",
          "+      return await run();",
          "+    } catch {",
          "+      await sleep(200);",
          "+    }",
          "+  }",
          " }",
        ].join("\n"),
      },
      children: [],
    },
    notes: {
      type: "Notes",
      props: {
        title: "Also worth knowing",
        items: ["CI: 1 check failed (lint).", "2 review comments are still unresolved."],
      },
      children: [],
    },
  },
};

export const terms = [
  "review",
  "pull request",
  "pr",
  "diff",
  "merge",
  "commit",
  "repo",
  "repository",
  "github",
  "ci",
  "审查",
  "代码审查",
  "评审",
  "合并",
  "拉取请求",
  "仓库",
  "提交",
  "改动",
  "补丁",
] as const;

export const review: Template = { id, when, prose, components, usage, example, terms };
