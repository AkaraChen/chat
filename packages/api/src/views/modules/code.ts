import type { ViewModule } from "../types";

export const id = "code" as const;

export const summary = "review a pull request (needs GitHub)";

export const when =
  "Use when the user gives a repository and a pull request number and asks for a review, a summary or the risks. Fetch the pull request first. Prose: the verdict in one sentence, then the repo, number and what was read (files, diff, CI, comments).";

export const routes = [
  ["review owner/repo#123", "Changes, the one Diff that matters most, Notes"],
  [
    "is this PR safe to merge",
    "Rows with a verdict per concern, then the Diff behind the worst one",
  ],
  ["what changed", "Changes only"],
] as const;

export const components = ["Answer", "Changes", "Diff", "Rows", "Notes"] as const;

export const usage = {
  Answer: "Root container with empty props. List the other elements in reading order.",
  Changes:
    "Files from get_pull_request_files with their real additions and deletions. List the largest few if there are many.",
  Diff: "The one hunk that matters most, copied from get_pull_request_diff. startLine is the new-file line of the first patch line. Note: one sentence on why it matters.",
  Notes: "Short observations such as CI status or unresolved comments, only from tool results.",
  Rows: "One row per concern with a positive, neutral or negative status when the user asks whether it is safe to merge.",
} as const;

export const example: ViewModule["example"] = {
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

export const code: ViewModule = { id, summary, when, routes, components, usage, example };
