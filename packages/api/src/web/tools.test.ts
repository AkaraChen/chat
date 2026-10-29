import { describe, expect, test } from "bun:test";

import type { WebSession } from "./mcp";
import { MAX_PAGE_CHARS, webTools } from "./tools";

const opts = { toolCallId: "t", messages: [] } as never;

type Call = { name: string; args: Record<string, unknown> };

function fakeServer(reply: (call: Call) => string) {
  const calls: Call[] = [];
  let connects = 0;
  let closes = 0;
  const session: WebSession = {
    async call(name, args) {
      calls.push({ name, args });
      return reply({ name, args });
    },
    async close() {
      closes++;
    },
  };
  return {
    connect: async () => {
      connects++;
      return session;
    },
    calls,
    counts: () => ({ connects, closes }),
  };
}

describe("web tools", () => {
  test("search maps results and passes limit and recency on", async () => {
    const server = fakeServer(() =>
      JSON.stringify({
        web: [
          { url: "https://bun.com/", title: "Bun", description: "A runtime" },
          { url: "https://x.test/" },
        ],
      }),
    );
    const { tools } = webTools(server.connect);
    const out = await tools.web_search.execute!({ query: "bun", recency: "week" }, opts);

    expect(server.calls).toEqual([
      { name: "web_search", args: { query: "bun", limit: 5, tbs: "qdr:w" } },
    ]);
    expect(out).toEqual({
      detail: { query: "bun", results: 2 },
      results: [
        { title: "Bun", url: "https://bun.com/", snippet: "A runtime" },
        { title: "", url: "https://x.test/", snippet: "" },
      ],
    });
  });

  test("fetch splits the header from the page and truncates a long one", async () => {
    const long = "a".repeat(MAX_PAGE_CHARS + 10);
    const server = fakeServer(() => `Title: Saw\nURL: https://www.stephango.com/saw\n\n${long}`);
    const { tools } = webTools(server.connect);
    const out = (await tools.web_fetch.execute!({ url: "https://stephango.com/saw" }, opts)) as {
      content: string;
    };

    expect(server.calls[0]).toEqual({
      name: "web_fetch",
      args: { url: "https://stephango.com/saw", formats: ["markdown"] },
    });
    expect(out).toMatchObject({
      detail: { host: "stephango.com" },
      title: "Saw",
      url: "https://www.stephango.com/saw",
      truncated: true,
    });
    expect(out.content).toHaveLength(MAX_PAGE_CHARS);
  });

  test("connects once on first use, and close ends it", async () => {
    const server = fakeServer(() => "plain page");
    const web = webTools(server.connect);
    await web.close();
    expect(server.counts()).toEqual({ connects: 0, closes: 0 });

    await web.tools.web_fetch.execute!({ url: "https://a.test/" }, opts);
    await web.tools.web_fetch.execute!({ url: "https://b.test/" }, opts);
    await web.close();
    expect(server.counts()).toEqual({ connects: 1, closes: 1 });
  });

  test("a failed connection is tried again on the next call", async () => {
    let attempts = 0;
    const server = fakeServer(() => "page");
    const { tools } = webTools(async () => {
      if (++attempts === 1) throw new Error("connection refused");
      return server.connect();
    });

    await expect(tools.web_fetch.execute!({ url: "https://a.test/" }, opts)).rejects.toThrow(
      "connection refused",
    );
    await expect(tools.web_fetch.execute!({ url: "https://a.test/" }, opts)).resolves.toMatchObject(
      {
        content: "page",
      },
    );
    expect(attempts).toBe(2);
  });
});
