import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { call } from "@orpc/server";

import { createTestDb, notesSpec, patches, say, scriptedModel } from "../chat/testing";
import type { Context } from "../context";
import { createCredentialStore, type Credential } from "../credentials/store";
import { createGithubStore } from "../github/store";
import { createModelsDev } from "../models/models-dev";
import { appRouter, truncateTitle } from "./index";

const sample = await Bun.file(
  new URL("../models/fixtures/models-dev.sample.json", import.meta.url),
).text();

let t: Awaited<ReturnType<typeof createTestDb>>;
let base: Omit<Context, "session">;
let queued: string[];

const cred = (type: Credential["type"], extra: Partial<Credential> = {}): Credential => ({
  type,
  method: "api_key",
  email: "",
  account_id: "",
  api_key: `key-${type}`,
  access_token: "",
  refresh_token: "",
  expires_at: "",
  ...extra,
});

// The proxy lists every stored model as `<connectionId>/<alias>`.
async function fakeProxyFetch(credentials: ReturnType<typeof createCredentialStore>) {
  return (async (url: string | URL | Request) => {
    if (!String(url).endsWith("/v1/models")) return new Response("no", { status: 404 });
    const data: { id: string }[] = [];
    for (const c of await credentials.list()) {
      const full = await credentials.get(c.id);
      const names = c.type === "claude" ? ["claude-x"] : (full?.models ?? []).map((m) => m.alias);
      for (const n of names) data.push({ id: `${c.id}/${n}` });
    }
    return Response.json({ data });
  }) as unknown as typeof fetch;
}

const as = (userId: string, role: "user" | "visitor" = "user"): Context => ({
  ...base,
  session: { userId, role },
});

beforeAll(async () => {
  t = await createTestDb();
  for (const id of ["u1", "u2"]) {
    await t.db.user.create({
      data: { id, name: id, email: `${id}@x.test`, username: id, role: "user" },
    });
  }
  const dir = await mkdtemp(path.join(tmpdir(), "routes-"));
  const credentials = createCredentialStore(path.join(dir, "auths"));
  queued = [];
  base = {
    db: t.db,
    credentials,
    github: createGithubStore(path.join(dir, "github.json")),
    modelsDev: createModelsDev({
      cachePath: path.join(dir, "models-dev.json"),
      fetch: (async () => new Response(sample)) as unknown as typeof fetch,
    }),
    proxy: { url: "http://proxy.test", apiKey: "k" },
    titleQueue: () => ({
      add: (async (_n: string, d: { threadId: string }) => void queued.push(d.threadId)) as never,
    }),
    createModel: () => scriptedModel([say(patches(notesSpec("Hi")))]),
    fetch: await fakeProxyFetch(credentials),
  };
});

afterAll(() => t.cleanup());

describe("models", () => {
  test("create and delete only work on openrouter and custom", async () => {
    const c = base.credentials;
    const claude = await c.save(cred("claude"));
    const openai = await c.save(cred("openai"));
    const gemini = await c.save(cred("gemini"));
    for (const id of [claude.id, openai.id, gemini.id]) {
      await expect(
        call(appRouter.models.create, { connectionId: id, modelId: "x" }, { context: as("u1") }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        call(appRouter.models.delete, { connectionId: id, modelId: "x" }, { context: as("u1") }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  test("custom takes its base_url from models.dev and models carry the models.dev name", async () => {
    const ctx = as("u1");
    await expect(
      call(appRouter.connections.saveApiKey, { type: "custom", apiKey: "k" }, { context: ctx }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(
        appRouter.connections.saveApiKey,
        { type: "custom", apiKey: "k", provider: "nope" },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const saved = await call(
      appRouter.connections.saveApiKey,
      { type: "custom", apiKey: "sk-1", provider: "deepseek" },
      { context: ctx },
    );
    const stored = await base.credentials.get(saved.id);
    expect(stored).toMatchObject({ provider: "deepseek", base_url: "https://api.deepseek.com" });

    const models = await call(
      appRouter.models.create,
      { connectionId: saved.id, modelId: "deepseek-flash" },
      { context: ctx },
    );
    expect(models).toEqual([
      { name: "deepseek-flash", alias: "deepseek-flash", display_name: expect.any(String) },
    ]);
    await expect(
      call(
        appRouter.models.create,
        { connectionId: saved.id, modelId: "no-tools" },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Saving the same key again keeps the models.
    await call(
      appRouter.connections.saveApiKey,
      { type: "custom", apiKey: "sk-1", provider: "deepseek" },
      { context: ctx },
    );
    expect((await base.credentials.get(saved.id))?.models).toHaveLength(1);

    // The response never carries the key.
    const list = await call(appRouter.models.list, undefined, { context: ctx });
    expect(JSON.stringify(list)).not.toContain("sk-1");
  });

  test("select is remembered, and unavailable once the connection is gone", async () => {
    const ctx = as("u2");
    const list = await call(appRouter.models.list, undefined, { context: ctx });
    expect(list.choice).toBeNull();
    const custom = list.connections.find((c) => c.type === "custom")!;
    await call(
      appRouter.models.select,
      { connectionId: custom.connectionId, modelId: "deepseek-flash" },
      { context: ctx },
    );
    expect((await call(appRouter.models.list, undefined, { context: ctx })).choice).toEqual({
      connectionId: custom.connectionId,
      modelId: "deepseek-flash",
      available: true,
    });
    await expect(
      call(
        appRouter.models.select,
        { connectionId: custom.connectionId, modelId: "ghost" },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await base.credentials.delete(custom.connectionId);
    expect((await call(appRouter.models.list, undefined, { context: ctx })).choice?.available).toBe(
      false,
    );
    await expect(
      call(appRouter.chat.send, { threadId: "x", text: "hi" }, { context: ctx }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("visitors are refused", async () => {
    await expect(
      call(appRouter.models.list, undefined, { context: as("u1", "visitor") }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("threads and chat", () => {
  test("threads are isolated by user", async () => {
    const a = await call(appRouter.threads.create, { text: "mine" }, { context: as("u1") });
    expect(a.titledAt).toBeNull();
    expect(await call(appRouter.threads.list, undefined, { context: as("u2") })).not.toContainEqual(
      expect.objectContaining({ id: a.id }),
    );
    await expect(
      call(appRouter.threads.get, { id: a.id }, { context: as("u2") }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(appRouter.chat.send, { threadId: a.id, text: "hi" }, { context: as("u2") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("send streams the answer, and threads.get returns it parsed", async () => {
    const ctx = as("u1");
    const claude = (await base.credentials.list()).find((c) => c.type === "claude")!;
    await call(
      appRouter.models.select,
      { connectionId: claude.id, modelId: "claude-x" },
      { context: ctx },
    );
    const thread = await call(
      appRouter.threads.create,
      { text: "  a\n  long\tmessage " },
      { context: ctx },
    );
    expect(thread.title).toBe("a long message");

    const stream = await call(
      appRouter.chat.send,
      { threadId: thread.id, text: "hi" },
      { context: ctx },
    );
    const types: string[] = [];
    for await (const chunk of stream) types.push(chunk.type);
    expect(types[0]).toBe("start");
    expect(types).toContain("data-spec");
    expect(types.at(-1)).toBe("finish");

    // Another user cannot send into this thread.
    await call(
      appRouter.models.select,
      { connectionId: claude.id, modelId: "claude-x" },
      { context: as("u2") },
    );
    await expect(
      call(appRouter.chat.send, { threadId: thread.id, text: "hi" }, { context: as("u2") }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const got = await call(appRouter.threads.get, { id: thread.id }, { context: ctx });
    expect(got.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(got.messages[1]).toMatchObject({
      text: "Hi",
      spec: notesSpec("Hi"),
      steps: [],
      connectionId: claude.id,
      modelId: "claude-x",
    });
    expect(queued).toEqual([thread.id]);

    const list = await call(appRouter.threads.list, undefined, { context: ctx });
    expect(list[0]!.id).toBe(thread.id);
  });

  test("titles are truncated", () => {
    expect(truncateTitle("x".repeat(100))).toBe(`${"x".repeat(40)}…`);
    expect(truncateTitle("short")).toBe("short");
  });
});

describe("github", () => {
  test("get only says whether a token is set", async () => {
    const ctx = as("u1");
    expect(await call(appRouter.github.get, undefined, { context: ctx })).toEqual({ set: false });
    await call(appRouter.github.save, { token: "ghp_secret" }, { context: ctx });
    const got = await call(appRouter.github.get, undefined, { context: ctx });
    expect(got).toEqual({ set: true });
    expect(JSON.stringify(got)).not.toContain("ghp_secret");
    await call(appRouter.github.clear, undefined, { context: ctx });
    expect(await call(appRouter.github.get, undefined, { context: ctx })).toEqual({ set: false });
  });
});
