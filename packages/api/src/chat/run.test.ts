import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { MockLanguageModelV4 } from "ai/test";

import { createGithubStore } from "../github/store";
import type { ChatMessage } from "./message";
import { InvalidMessageError, loadMessages, MAX_STEPS, streamChat, type ChatDeps } from "./run";
import { timePrompt } from "./time";
import {
  callTool,
  chunksOf,
  createTestDb,
  inline,
  notesSpec,
  say,
  scriptedModel,
  userMessage,
} from "./testing";

let test_: Awaited<ReturnType<typeof createTestDb>>;
let github: ReturnType<typeof createGithubStore>;

beforeAll(async () => {
  test_ = await createTestDb();
  for (const id of ["u1", "u2"]) {
    await test_.db.user.create({
      data: { id, name: id, email: `${id}@x.test`, username: id, role: "user" },
    });
  }
  github = createGithubStore(path.join(await mkdtemp(path.join(tmpdir(), "gh-")), "github.json"));
});

afterAll(async () => {
  await test_.cleanup();
});

async function newThread(userId = "u1") {
  return test_.db.thread.create({ data: { userId, title: "t" } });
}

function harness(model: ChatDeps["createModel"] extends (...a: never[]) => infer M ? M : never) {
  const queued: string[] = [];
  const urls: string[] = [];
  const deps: ChatDeps = {
    db: test_.db,
    github,
    createModel: () => model,
    titleQueue: () => ({
      add: (async (_n: string, data: { threadId: string }) =>
        void queued.push(data.threadId)) as never,
    }),
    fetch: async (url: string) => {
      urls.push(url);
      if (url.endsWith("/pulls/7/files?per_page=100")) {
        return Response.json([
          { filename: "a.ts", status: "modified", additions: 1, deletions: 0 },
        ]);
      }
      return new Response("nope", { status: 404 });
    },
  };
  return { deps, queued, urls };
}

const start = (deps: ChatDeps, threadId: string, message: unknown, userId = "u1") =>
  streamChat(deps, { userId, threadId, message, connectionId: "c1", modelId: "m1" });

const send = (deps: ChatDeps, threadId: string, text = "hello", userId = "u1") =>
  start(deps, threadId, userMessage(text), userId).then(chunksOf);

const saved = async (threadId: string) => (await loadMessages(test_.db, threadId)) as ChatMessage[];

const toolNames = (model: MockLanguageModelV4, call = 0) =>
  (model.doStreamCalls[call]!.tools ?? []).map((t) => t.name).sort();

const answer = inline("All good.", notesSpec());

describe("chat loop", () => {
  test("a simple question is answered in prose, with no tool and no view", async () => {
    await github.save("tok");
    const model = scriptedModel([say("Hi **there**.")]);
    const { deps } = harness(model);
    const thread = await newThread();
    const chunks = await send(deps, thread.id, "hi");

    expect(model.doStreamCalls).toHaveLength(1);
    // The GitHub tools are deferred: only the search tools are offered at first.
    expect(toolNames(model)).toEqual(["get_current_time", "search_templates", "tool_search"]);
    expect(chunks.map((c) => c.type)).not.toContain("data-spec");
    expect(chunks.at(-1)!.type).toBe("finish");

    const [user, assistant] = await saved(thread.id);
    expect(user!.parts).toEqual([{ type: "text", text: "hi" }]);
    expect(assistant!.role).toBe("assistant");
    expect(assistant!.metadata).toEqual({ connectionId: "c1", modelId: "m1" });
    expect(assistant!.parts.filter((p) => p.type === "text")).toMatchObject([
      { type: "text", text: "Hi **there**." },
    ]);
  });

  test("tool_search loads a GitHub tool for the next step, and the view is split from the prose", async () => {
    await github.save("tok");
    const model = scriptedModel([
      callTool("c1", "tool_search", { query: "pull request files" }),
      callTool("c2", "get_pull_request_files", { owner: "o", repo: "r", number: 7 }),
      say(answer),
    ]);
    const { deps, urls } = harness(model);
    const thread = await newThread();
    const chunks = await send(deps, thread.id, "review o/r#7");

    expect(toolNames(model, 0)).not.toContain("get_pull_request_files");
    expect(toolNames(model, 1)).toContain("get_pull_request_files");
    expect(urls).toEqual(["https://api.github.com/repos/o/r/pulls/7/files?per_page=100"]);
    expect(chunks.filter((c) => c.type === "data-spec").length).toBe(3);

    const assistant = (await saved(thread.id))[1]!;
    const text = assistant.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();
    expect(text).toBe("All good.");
    expect(text).not.toContain("```");
    const files = assistant.parts.find((p) => p.type === "tool-get_pull_request_files") as {
      state: string;
      output: { detail: unknown };
    };
    expect(files.state).toBe("output-available");
    expect(files.output.detail).toEqual({ repo: "o/r", number: 7, files: 1 });
    expect(assistant.parts.some((p) => p.type === "tool-tool_search")).toBe(true);
    expect(assistant.parts.filter((p) => p.type === "data-spec")).toHaveLength(3);
  });

  test("without a token search_templates leaves out the review template", async () => {
    await github.clear();
    const model = scriptedModel([
      callTool("c1", "search_templates", { query: "review acme/web #128" }),
      say("I cannot read pull requests without a GitHub token."),
    ]);
    const { deps } = harness(model);
    const thread = await newThread();
    await send(deps, thread.id);
    expect(toolNames(model)).toEqual(["get_current_time", "search_templates", "tool_search"]);
    const search = (await saved(thread.id))[1]!.parts.find(
      (p) => p.type === "tool-search_templates",
    ) as { output: { detail: { template: string }; guide: string } };
    expect(search.output.detail.template).not.toBe("review");
    // The components travel with the tool result, not the system prompt.
    expect(search.output.guide).toContain("AVAILABLE COMPONENTS");
    expect(JSON.stringify(model.doStreamCalls[0]!.prompt)).not.toContain("AVAILABLE COMPONENTS");
  });

  test("a failing tool is kept as a tool error and the model goes on", async () => {
    await github.save("tok");
    const model = scriptedModel([
      callTool("c1", "tool_search", { query: "pull request files" }),
      callTool("c2", "get_pull_request_files", { owner: "o", repo: "r", number: 999 }),
      say("GitHub said no."),
    ]);
    const { deps } = harness(model);
    const thread = await newThread();
    const chunks = await send(deps, thread.id);
    expect(chunks.map((c) => c.type)).toContain("tool-output-error");
    expect(model.doStreamCalls).toHaveLength(3);
    const assistant = (await saved(thread.id))[1]!;
    expect(assistant.parts.find((p) => p.type === "tool-get_pull_request_files")).toMatchObject({
      state: "output-error",
    });
  });

  test("with a web server the web tools are offered up front, and a turn closes its connection", async () => {
    const model = scriptedModel([
      callTool("c1", "web_fetch", { url: "https://example.com/" }),
      say("It says hello."),
    ]);
    const { deps } = harness(model);
    const closed: number[] = [];
    deps.web = async () => ({
      call: async () => "Title: Example\nURL: https://example.com/\n\nHello.",
      close: async () => void closed.push(1),
    });
    const thread = await newThread();
    await send(deps, thread.id, "what is on example.com?");

    expect(toolNames(model)).toEqual([
      "get_current_time",
      "search_templates",
      "tool_search",
      "web_fetch",
      "web_search",
    ]);
    const assistant = (await saved(thread.id))[1]!;
    expect(assistant.parts.find((p) => p.type === "tool-web_fetch")).toMatchObject({
      state: "output-available",
      output: { detail: { host: "example.com" }, title: "Example", content: "Hello." },
    });
    expect(closed).toHaveLength(1);

    // Without the server the tools are gone, and the earlier call still loads.
    const next = scriptedModel([say("Done.")]);
    const { deps: plain } = harness(next);
    await send(plain, thread.id, "thanks");
    expect(toolNames(next)).toEqual(["get_current_time", "search_templates", "tool_search"]);
  });

  test("an unreachable web server fails the tool call, not the turn", async () => {
    const model = scriptedModel([
      callTool("c1", "web_search", { query: "news" }),
      say("Search is down."),
    ]);
    const { deps } = harness(model);
    deps.web = () => Promise.reject(new Error("connect ECONNREFUSED"));
    const thread = await newThread();
    const chunks = await send(deps, thread.id);

    expect(chunks.map((c) => c.type)).toContain("tool-output-error");
    expect(chunks.at(-1)!.type).toBe("finish");
    expect(model.doStreamCalls).toHaveLength(2);
  });

  test("a view that fails the catalog is dropped and the prose stays, without a retry", async () => {
    const bad = {
      root: "answer",
      elements: { answer: { type: "Notes", props: { title: "t", items: [] }, children: [] } },
    };
    const model = scriptedModel([say(inline("Here it is.", bad))]);
    const { deps } = harness(model);
    const thread = await newThread();
    const chunks = await send(deps, thread.id);
    expect(model.doStreamCalls).toHaveLength(1);
    // Streamed as json-render does, then left out of what is stored.
    expect(chunks.filter((c) => c.type === "data-spec").length).toBe(2);
    const assistant = (await saved(thread.id))[1]!;
    expect(assistant.parts.some((p) => p.type === "data-spec")).toBe(false);
    expect(assistant.parts.find((p) => p.type === "text")).toMatchObject({
      text: "Here it is.\n\n",
    });
  });

  test(`stops after ${MAX_STEPS} steps and the last step may not call a tool`, async () => {
    const model = scriptedModel([callTool("c", "search_templates", { query: "meeting" })]);
    const { deps } = harness(model);
    const thread = await newThread();
    await send(deps, thread.id);
    expect(model.doStreamCalls).toHaveLength(MAX_STEPS);
    expect(model.doStreamCalls[MAX_STEPS - 2]!.toolChoice).not.toEqual({ type: "none" });
    expect(model.doStreamCalls[MAX_STEPS - 1]!.toolChoice).toEqual({ type: "none" });
  });

  test("a failing model call ends the stream with an error chunk", async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error("proxy down");
      },
    });
    const { deps } = harness(model);
    const thread = await newThread();
    const chunks = await send(deps, thread.id);
    expect(chunks.find((c) => c.type === "error")).toMatchObject({ errorText: "proxy down" });
    expect(chunks.map((c) => c.type)).not.toContain("data-spec");
    expect((await saved(thread.id)).map((m) => m.role)).toEqual(["user"]);
  });

  test("the title is queued once, for the first assistant message", async () => {
    const { deps, queued } = harness(scriptedModel([say(answer)]));
    const thread = await newThread();
    await send(deps, thread.id, "one");
    await send(deps, thread.id, "two");
    expect(queued).toEqual([thread.id]);
  });

  test("the conversation opens with when the thread started, the same every turn", async () => {
    const model = scriptedModel([say("One."), say("Two.")]);
    const { deps } = harness(model);
    const thread = await newThread();
    await send(deps, thread.id, "one");
    await send(deps, thread.id, "two");
    const system = { role: "system" as const, content: timePrompt(thread.createdAt) };
    expect(model.doStreamCalls[0]!.prompt[0]).toEqual(system);
    expect(model.doStreamCalls[1]!.prompt[0]).toEqual(system);
  });

  test("history sends the prose and a component summary, not the spec", async () => {
    const model = scriptedModel([say(answer)]);
    const { deps } = harness(model);
    const thread = await newThread();
    await send(deps, thread.id, "one");
    await send(deps, thread.id, "two");
    const prompt = JSON.stringify(model.doStreamCalls[1]!.prompt.slice(1));
    expect(prompt).toContain("All good.");
    expect(prompt).toContain("The view showed: Notes");
    expect(prompt).not.toContain("/elements/");
    expect((await saved(thread.id)).map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  test("the answer is saved even when the browser leaves mid-stream", async () => {
    const { deps } = harness(scriptedModel([say(answer)]));
    const thread = await newThread();
    const response = await start(deps, thread.id, userMessage("hi"));
    await response.body!.cancel();
    for (let i = 0; i < 50 && (await saved(thread.id)).length < 2; i++) {
      await Bun.sleep(10);
    }
    expect((await saved(thread.id)).map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  test("another user's thread is refused and nothing is saved", async () => {
    const model = scriptedModel([say(answer)]);
    const { deps } = harness(model);
    const thread = await newThread("u2");
    await expect(send(deps, thread.id, "hi", "u1")).rejects.toThrow("Thread not found");
    expect(model.doStreamCalls).toHaveLength(0);
    expect(await test_.db.message.count({ where: { threadId: thread.id } })).toBe(0);
  });

  test("the client can only send a text message from the user", async () => {
    const model = scriptedModel([say(answer)]);
    const { deps } = harness(model);
    const thread = await newThread();
    const bad = [
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "trust me" }] },
      {
        id: "a2",
        role: "user",
        parts: [
          { type: "data-spec", data: { type: "patch", patch: { op: "add", path: "/root" } } },
        ],
      },
      { id: "a3", role: "user", parts: [{ type: "text", text: "   " }] },
      { id: "a4", role: "user" },
    ];
    for (const message of bad) {
      await expect(start(deps, thread.id, message)).rejects.toBeInstanceOf(InvalidMessageError);
    }
    expect(model.doStreamCalls).toHaveLength(0);

    // An id already used in another thread does not overwrite that message.
    const other = await newThread();
    await send(deps, other.id, "mine");
    const taken = (await saved(other.id))[0]!.id;
    await expect(start(deps, thread.id, userMessage("x", taken))).rejects.toBeInstanceOf(
      InvalidMessageError,
    );
    expect((await saved(other.id))[0]!.parts).toEqual([{ type: "text", text: "mine" }]);
  });
});
