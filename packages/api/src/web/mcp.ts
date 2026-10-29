import { createMCPClient } from "@ai-sdk/mcp";

/** One connection to the web access MCP server, for one turn. */
export type WebSession = {
  /** Calls a tool and returns its text. A tool error is thrown with the server's message. */
  call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
  close(): Promise<void>;
};

export type WebConnect = () => Promise<WebSession>;

// Connecting and the first exchange should be quick; a page fetch can take longer.
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Connects to sex-lite (https://github.com/AkaraChen/sex) over streamable HTTP.
 * It serves `web_search` (SearXNG) and `web_fetch` (Defuddle) at `/mcp`.
 */
export function createMcpConnect(url: string): WebConnect {
  return async () => {
    const client = await createMCPClient({
      transport: { type: "http", url },
      clientName: "chat",
      initializationOptions: { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) },
    });
    return {
      async call(name, args, signal) {
        const result = await client.callTool({ name, arguments: args, options: { signal } });
        const content = "content" in result && Array.isArray(result.content) ? result.content : [];
        const text = content
          .map((item) => (item.type === "text" ? item.text : ""))
          .join("")
          .trim();
        if (result.isError) throw new Error(text || `${name} failed`);
        return text;
      },
      close: () => client.close(),
    };
  };
}
