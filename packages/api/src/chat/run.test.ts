import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { UIMessageChunk } from "ai";

import { createGithubStore } from "../github/store";
import { sendChat, FALLBACK_LEAD, type ChatDeps } from "./run";
import { callTool, createTestDb, notesSpec, patches, say, scriptedModel } from "./testing";

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

function harness(steps: Parameters<typeof scriptedModel>[0]) {
  const model = scriptedModel(steps);
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
  return { model, deps, queued, urls };
}

async function collect(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

const send = (deps: ChatDeps, threadId: string, text = "hello", userId = "u1") =>
  sendChat(deps, { userId, threadId, text, connectionId: "c1", modelId: "m1" }).then(collect);

const valid = patches(notesSpec("All good"));
const toolNames = (model: { doStreamCalls: { tools?: { name: string }[] }[] }) =>
  (model.doStreamCalls[0]!.tools ?? []).map((t) => t.name).sort();

describe("chat loop", () => {
  test("runs search_templates then a GitHub tool and ends with a valid spec", async () => {
    await github.save("tok");
    const { deps, urls, model } = harness([
      callTool("c1", "search_templates", { query: "review PR" }, "let me look"),
      callTool("c2", "get_pull_request_files", { owner: "o", repo: "r", number: 7 }),
      say(valid),
    ]);
    const thread = await newThread();
    const chunks = await send(deps, thread.id, "review o/r#7");

    expect(urls).toEqual(["https://api.github.com/repos/o/r/pulls/7/files?per_page=100"]);
    expect(toolNames(model)).toContain("get_pull_request_files");

    // Text before the first tool call was thrown away.
    expect(chunks.map((c) => c.type)).toContain("data-spec-reset");
    const texts = chunks.filter((c) => c.type === "text-delta");
    expect(texts).toHaveLength(2);
    expect((texts.at(-1) as { delta: string }).delta).toBe(valid);

    const outputs = chunks.filter((c) => c.type === "tool-output-available") as {
      output: { detail: Record<string, unknown> };
    }[];
    expect(outputs).toHaveLength(2);
    expect(outputs[0]!.output).toEqual({ detail: { template: "review" } });
    expect(outputs[1]!.output.detail).toEqual({ repo: "o/r", number: 7, files: 1 });

    const final = chunks.find((c) => c.type === "data-spec") as { data: { root: string } };
    expect(final.data.root).toBe("answer");
    expect(chunks.at(-1)!.type).toBe("finish");

    const saved = await test_.db.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
    });
    expect(saved.map((m) => m.role)).toEqual(["user", "assistant"]);
    const answer = saved[1]!;
    expect(answer.text).toBe("All good");
    expect(answer.connectionId).toBe("c1");
    expect(answer.modelId).toBe("m1");
    expect(JSON.parse(answer.spec!)).toEqual(notesSpec("All good"));
    expect(JSON.parse(answer.steps!)).toEqual([
      { tool: "search_templates", status: "done", detail: { template: "review" } },
      {
        tool: "get_pull_request_files",
        status: "done",
        detail: { repo: "o/r", number: 7, files: 1 },
      },
    ]);
  });

  test("without a token the GitHub tools are not offered", async () => {
    await github.clear();
    const { deps, model } = harness([say(valid)]);
    const thread = await newThread();
    await send(deps, thread.id);
    expect(toolNames(model)).toEqual(["search_templates"]);
    const steps = await test_.db.message.findFirst({
      where: { threadId: thread.id, role: "assistant" },
    });
    expect(JSON.parse(steps!.steps!)).toEqual([]);
  });

  test("a failing tool is persisted as an error step", async () => {
    await github.save("tok");
    const { deps } = harness([
      callTool("c1", "get_pull_request_files", { owner: "o", repo: "r", number: 999 }),
      say(valid),
    ]);
    const thread = await newThread();
    const chunks = await send(deps, thread.id);
    expect(chunks.map((c) => c.type)).toContain("tool-output-error");
    const row = await test_.db.message.findFirst({
      where: { threadId: thread.id, role: "assistant" },
    });
    expect(JSON.parse(row!.steps!)).toMatchObject([
      { tool: "get_pull_request_files", status: "error", detail: {} },
    ]);
  });

  test("an invalid spec is retried once with the errors", async () => {
    const { deps, model } = harness([say("not a spec"), say(valid)]);
    const thread = await newThread();
    const chunks = await send(deps, thread.id);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(JSON.stringify(model.doStreamCalls[1]!.prompt)).toContain("not a valid spec");
    expect(chunks.filter((c) => c.type === "data-spec-reset")).toHaveLength(1);
    const row = await test_.db.message.findFirst({
      where: { threadId: thread.id, role: "assistant" },
    });
    expect(row!.text).toBe("All good");
  });

  test("still invalid after the retry falls back to a minimal Answer", async () => {
    const { deps, model } = harness([say("nope"), say("still nope")]);
    const thread = await newThread();
    const chunks = await send(deps, thread.id);
    expect(model.doStreamCalls).toHaveLength(2);
    const final = chunks.find((c) => c.type === "data-spec") as {
      data: { elements: Record<string, { props: { lead: string } }> };
    };
    expect(final.data.elements.answer!.props.lead).toBe(FALLBACK_LEAD);
    const row = await test_.db.message.findFirst({
      where: { threadId: thread.id, role: "assistant" },
    });
    expect(row!.text).toBe(FALLBACK_LEAD);
    expect(JSON.parse(row!.spec!).root).toBe("answer");
  });

  test("the title is queued once, for the first assistant message", async () => {
    const { deps, queued } = harness([say(valid)]);
    const thread = await newThread();
    await send(deps, thread.id, "one");
    await send(deps, thread.id, "two");
    expect(queued).toEqual([thread.id]);
  });

  test("history sends the lead and a component summary, not the spec", async () => {
    const { deps, model } = harness([say(valid)]);
    const thread = await newThread();
    await send(deps, thread.id, "one");
    await send(deps, thread.id, "two");
    const prompt = JSON.stringify(model.doStreamCalls[1]!.prompt.slice(1));
    expect(prompt).toContain("All good");
    expect(prompt).toContain("The view showed: Notes");
    expect(prompt).not.toContain("/elements/");
    expect(prompt).not.toContain('\\"props\\"');
  });

  test("another user's thread is refused and nothing is saved", async () => {
    const { deps, model } = harness([say(valid)]);
    const thread = await newThread("u2");
    await expect(send(deps, thread.id, "hi", "u1")).rejects.toThrow("Thread not found");
    expect(model.doStreamCalls).toHaveLength(0);
    expect(await test_.db.message.count({ where: { threadId: thread.id } })).toBe(0);
  });
});
