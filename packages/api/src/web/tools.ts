import { tool, type Tool } from "ai";
import { z } from "zod";

import type { WebConnect, WebSession } from "./mcp";

// Keeps one long page from eating the model's context and the stored message.
export const MAX_PAGE_CHARS = 40_000;
const MAX_RESULTS = 10;

const RECENCY = { day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" } as const;

const searchInput = z.object({
  query: z.string().min(1).max(500).describe("What to search for"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_RESULTS)
    .optional()
    .describe("How many results, 1-10. Defaults to 5."),
  recency: z
    .enum(["day", "week", "month", "year"])
    .optional()
    .describe("Only results from the past day, week, month or year"),
});

const fetchInput = z.object({
  url: z.url({ protocol: /^https?$/ }).describe("The page to read, http or https"),
});

type SearchData = { web?: { url: string; title?: string; description?: string }[] };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// sex-lite answers a markdown-only fetch as "Title: …\nURL: …\n\n<markdown>".
function parsePage(text: string, requested: string) {
  const match = /^Title: (.*)\nURL: (.*)\n\n/.exec(text);
  if (!match) return { title: "", url: requested, markdown: text };
  return {
    title: match[1]!.trim(),
    url: match[2]!.trim() || requested,
    markdown: text.slice(match[0].length),
  };
}

export const webToolIds = ["web_search", "web_fetch"] as const;
export type WebToolId = (typeof webToolIds)[number];

/**
 * `web_search` and `web_fetch`, run on the MCP server `connect` reaches. The
 * connection opens on the first call, so a turn that never looks anything up
 * does not make one. Call `close` when the turn ends.
 */
export function webTools(connect: WebConnect): {
  tools: Record<WebToolId, Tool>;
  close: () => Promise<void>;
} {
  let session: Promise<WebSession> | undefined;
  const open = () => {
    if (!session) {
      const attempt = connect();
      // A failed connection is not kept, so the next call tries again.
      attempt.catch(() => {
        if (session === attempt) session = undefined;
      });
      session = attempt;
    }
    return session;
  };

  const tools = {
    web_search: tool({
      description:
        "Search the web. Returns titles, URLs and snippets. Use it for anything current or that you are unsure of, then read the few pages that matter with web_fetch.",
      inputSchema: searchInput,
      async execute({ query, limit, recency }, { abortSignal }) {
        const web = await open();
        const text = await web.call(
          "web_search",
          { query, limit: limit ?? 5, ...(recency ? { tbs: RECENCY[recency] } : {}) },
          abortSignal,
        );
        const data = JSON.parse(text) as SearchData & { warning?: string };
        const results = (data.web ?? []).map((r) => ({
          title: r.title ?? "",
          url: r.url,
          snippet: r.description ?? "",
        }));
        return {
          detail: { query, results: results.length },
          results,
          ...(data.warning ? { warning: data.warning } : {}),
        };
      },
    }),

    web_fetch: tool({
      description:
        "Read one web page as markdown: its main content, without navigation or ads. Long pages are truncated. Pages that need JavaScript to render may come back empty.",
      inputSchema: fetchInput,
      async execute({ url }, { abortSignal }) {
        const web = await open();
        const text = await web.call("web_fetch", { url, formats: ["markdown"] }, abortSignal);
        const page = parsePage(text, url);
        const truncated = page.markdown.length > MAX_PAGE_CHARS;
        return {
          detail: { host: hostOf(page.url) },
          title: page.title,
          url: page.url,
          truncated,
          content: truncated ? page.markdown.slice(0, MAX_PAGE_CHARS) : page.markdown,
        };
      },
    }),
  };

  return {
    tools,
    async close() {
      const current = session;
      session = undefined;
      if (!current) return;
      await current.then((s) => s.close()).catch(() => {});
    },
  };
}

// Schemas only: history can hold web tool calls whether or not the server is set now.
export const webToolSchemas = webTools(() => Promise.reject(new Error("not connected"))).tools;
