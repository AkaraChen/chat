import { describe, expect, test } from "bun:test";

import { githubTools, githubToolsFor, MAX_DIFF_CHARS } from "./tools";

type Call = { url: string; init?: RequestInit };

function fake(routes: Record<string, () => Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (!key) return new Response("nope", { status: 404 });
    return routes[key]!();
  };
  return { calls, fetch };
}

const json = (value: unknown) => () => Response.json(value);
const args = { owner: "o", repo: "r", number: 7 };
const run = (t: { execute?: (...a: any[]) => any }, input = args) =>
  t.execute!(input, { toolCallId: "1", messages: [] });

describe("github tools", () => {
  test("no token means no tools", () => {
    expect(githubToolsFor(null)).toEqual({});
    expect(Object.keys(githubToolsFor("t", fake({}).fetch))).toHaveLength(5);
  });

  test("get_pull_request", async () => {
    const { calls, fetch } = fake({
      "/repos/o/r/pulls/7": json({
        title: "T",
        body: null,
        state: "open",
        base: { ref: "main" },
        head: { ref: "f", sha: "abc" },
        html_url: "u",
      }),
    });
    const out = await run(githubTools({ token: "tok", fetch }).get_pull_request);
    expect(out.detail).toEqual({ repo: "o/r", number: 7 });
    expect(out.title).toBe("T");
    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(calls[0]!.url).toBe("https://api.github.com/repos/o/r/pulls/7");
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers.Accept).toBe("application/vnd.github+json");
  });

  test("files reports the count", async () => {
    const { calls, fetch } = fake({
      "/pulls/7/files?per_page=100": json([
        { filename: "a", status: "modified", additions: 1, deletions: 2, patch: "x" },
        { filename: "b", status: "added", additions: 3, deletions: 0 },
      ]),
    });
    const out = await run(githubTools({ token: "t", fetch }).get_pull_request_files);
    expect(out.detail).toEqual({ repo: "o/r", number: 7, files: 2 });
    expect(out.files[0]).not.toHaveProperty("patch");
    expect(calls).toHaveLength(1);
  });

  test("diff counts lines and truncates", async () => {
    const body = `--- a/f\n+++ b/f\n@@\n+one\n+two\n-three\n ctx\n${"+x\n".repeat(MAX_DIFF_CHARS)}`;
    const { calls, fetch } = fake({ "/pulls/7": () => new Response(body) });
    const out = await run(githubTools({ token: "t", fetch }).get_pull_request_diff);
    expect(out.detail).toEqual({ additions: 2 + MAX_DIFF_CHARS, deletions: 1 });
    expect(out.truncated).toBe(true);
    expect(out.diff.length).toBe(MAX_DIFF_CHARS);
    expect((calls[0]!.init!.headers as Record<string, string>).Accept).toBe(
      "application/vnd.github.diff",
    );
  });

  test("checks look up the head sha first", async () => {
    const { calls, fetch } = fake({
      "/pulls/7": json({ head: { sha: "deadbeef", ref: "f" }, base: { ref: "main" } }),
      "/commits/deadbeef/check-runs?per_page=100": json({
        total_count: 3,
        check_runs: [
          { name: "a", status: "completed", conclusion: "success", html_url: null },
          { name: "b", status: "completed", conclusion: "failure", html_url: null },
          { name: "c", status: "in_progress", conclusion: null, html_url: null },
        ],
      }),
    });
    const out = await run(githubTools({ token: "t", fetch }).get_pull_request_checks);
    expect(out.detail).toEqual({ failed: 1 });
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.github.com/repos/o/r/pulls/7",
      "https://api.github.com/repos/o/r/commits/deadbeef/check-runs?per_page=100",
    ]);
  });

  test("comments count unresolved threads via GraphQL", async () => {
    const { calls, fetch } = fake({
      "/graphql": json({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  { isResolved: true, path: "a", comments: { nodes: [] } },
                  {
                    isResolved: false,
                    path: "b",
                    comments: { nodes: [{ author: { login: "x" }, body: "fix" }] },
                  },
                ],
              },
            },
          },
        },
      }),
    });
    const out = await run(githubTools({ token: "t", fetch }).list_pull_request_comments);
    expect(out.detail).toEqual({ unresolved: 1 });
    expect(calls[0]!.url).toBe("https://api.github.com/graphql");
    expect(calls[0]!.init!.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init!.body as string).variables).toEqual({
      owner: "o",
      repo: "r",
      number: 7,
    });
  });

  test("HTTP errors reject", async () => {
    const { fetch } = fake({});
    await expect(run(githubTools({ token: "t", fetch }).get_pull_request)).rejects.toThrow("404");
  });
});
