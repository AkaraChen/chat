import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { call } from "@orpc/server";

import { handleChatRequest } from "../chat/http";
import {
  chunksOf,
  createTestDb,
  inline,
  notesSpec,
  say,
  scriptedModel,
  userMessage,
} from "../chat/testing";
import type { Context } from "../context";
import type { OpenAIDeviceAuth } from "../credentials/openai-device";
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
let deviceStep: "pending" | "done" = "pending";

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
      // A sign-in's models come from the plan, as CLIProxyAPI lists them.
      const names = c.method === "oauth" ? ["gpt-5.5"] : (full?.models ?? []).map((m) => m.alias);
      for (const n of names) data.push({ id: `${c.id}/${n}` });
    }
    return Response.json({ data });
  }) as unknown as typeof fetch;
}

const chat = (context: Context, body: unknown) =>
  handleChatRequest(
    context,
    new Request("http://app.test/api/chat", { method: "POST", body: JSON.stringify(body) }),
  );

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
    openaiDevice: {
      start: async () => ({
        deviceAuthId: "dev-1",
        userCode: "ABCD-1234",
        verificationUrl: "https://auth.openai.com/codex/device",
        intervalSeconds: 5,
        expiresAt: "2026-10-25T00:15:00.000Z",
      }),
      poll: async () =>
        deviceStep === "pending"
          ? { status: "pending" }
          : {
              status: "done",
              credential: {
                ...cred("openai"),
                method: "oauth",
                api_key: "",
                email: "me@example.com",
                account_id: "acct-9",
                access_token: "at",
                refresh_token: "rt-secret",
                id_token: "it",
                plan_type: "plus",
              },
            },
    } satisfies OpenAIDeviceAuth,
    proxy: { url: "http://proxy.test", apiKey: "k" },
    titleQueue: () => ({
      add: (async (_n: string, d: { threadId: string }) => void queued.push(d.threadId)) as never,
    }),
    createModel: () => scriptedModel([say(inline("Hi.", notesSpec()))]),
    fetch: await fakeProxyFetch(credentials),
    authSecret: "test-secret",
  };
});

afterAll(() => t.cleanup());

describe("models", () => {
  test("a saved key gets its provider's models from models.dev at once", async () => {
    const ctx = as("u1");
    const gemini = await call(
      appRouter.connections.saveApiKey,
      { type: "gemini", apiKey: "AIza-1" },
      { context: ctx },
    );
    const openai = await call(
      appRouter.connections.saveApiKey,
      { type: "openai", apiKey: "sk-openai" },
      { context: ctx },
    );
    const list = await call(appRouter.models.list, undefined, { context: ctx });
    const models = (id: string) =>
      list.connections.find((c) => c.connectionId === id)?.models.map((m) => m.id);
    expect(models(gemini.id)).toEqual(["gemini-3.5-flash"]);
    expect(models(openai.id)).toEqual(["gpt-5.5"]);
    expect(list.connections.find((c) => c.connectionId === gemini.id)?.models[0]?.name).toBe(
      "Gemini 3.5 Flash",
    );
  });

  test("ChatGPT sign-in: pending until the code is entered, then a connection with no list", async () => {
    const ctx = as("u1");
    const started = await call(appRouter.connections.openaiSignIn.start, undefined, {
      context: ctx,
    });
    expect(started.userCode).toBe("ABCD-1234");
    const input = { deviceAuthId: started.deviceAuthId, userCode: started.userCode };
    deviceStep = "pending";
    expect(await call(appRouter.connections.openaiSignIn.poll, input, { context: ctx })).toEqual({
      status: "pending",
    });
    deviceStep = "done";
    const done = await call(appRouter.connections.openaiSignIn.poll, input, { context: ctx });
    expect(done).toMatchObject({
      status: "done",
      connection: { type: "openai", method: "oauth", label: "me@example.com" },
    });
    expect(JSON.stringify(done)).not.toContain("rt-secret");
    const id = done.status === "done" ? done.connection.id : "";
    // Its models come from the plan, through the proxy, not from a list here.
    const list = await call(appRouter.models.list, undefined, { context: ctx });
    expect(list.connections.find((c) => c.connectionId === id)?.models.map((m) => m.id)).toEqual([
      "gpt-5.5",
    ]);
    await expect(
      call(appRouter.models.create, { connectionId: id, modelId: "x" }, { context: ctx }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await base.credentials.delete(id);
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

    // Synced from models.dev: tool-calling text models only.
    const synced = (await base.credentials.get(saved.id))?.models?.map((m) => m.name);
    expect(synced?.sort()).toEqual(["deepseek-flash", "deepseek-v4-pro"]);

    // A model models.dev does not list can be added by hand, and removed;
    // a synced one cannot be removed.
    const added = await call(
      appRouter.models.create,
      { connectionId: saved.id, modelId: "deepseek-preview", displayName: "Preview" },
      { context: ctx },
    );
    expect(added.at(-1)).toEqual({
      name: "deepseek-preview",
      alias: "deepseek-preview",
      display_name: "Preview",
      manual: true,
    });
    await expect(
      call(
        appRouter.models.delete,
        { connectionId: saved.id, modelId: "deepseek-flash" },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Saving the same key again, and a refresh, keep the hand-added model.
    await call(
      appRouter.connections.saveApiKey,
      { type: "custom", apiKey: "sk-1", provider: "deepseek" },
      { context: ctx },
    );
    const refreshed = await call(appRouter.models.refresh, undefined, { context: ctx });
    expect(refreshed.find((r) => r.connectionId === saved.id)).toMatchObject({ models: 3 });
    const removed = await call(
      appRouter.models.delete,
      { connectionId: saved.id, modelId: "deepseek-preview" },
      { context: ctx },
    );
    expect(removed.map((m) => m.name)).not.toContain("deepseek-preview");

    // The response never carries the key.
    const list = await call(appRouter.models.list, undefined, { context: ctx });
    expect(JSON.stringify(list)).not.toContain("sk-1");
  });

  test("select is remembered, and unavailable once the connection is gone", async () => {
    const ctx = as("u2");
    const list = await call(appRouter.models.list, undefined, { context: ctx });
    expect(list.choice).toBeNull();
    const custom = list.connections.find((c) => c.type === "custom")!;
    // It reads as its models.dev provider, not the id.
    expect(custom).toMatchObject({ label: "deepseek", name: "DeepSeek" });
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
    const removed = await chat(ctx, { id: "x", message: userMessage("hi") });
    expect(removed.status).toBe(400);
    expect(await removed.text()).toContain("connection was removed");
  });

  test("visitors are refused", async () => {
    await expect(
      call(appRouter.models.list, undefined, { context: as("u1", "visitor") }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await chat(as("u1", "visitor"), { id: "x", message: userMessage("hi") })).status).toBe(
      403,
    );
    expect(
      (await chat({ ...base, session: null }, { id: "x", message: userMessage("hi") })).status,
    ).toBe(401);
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
    const refused = await chat(as("u2"), { id: a.id, message: userMessage("hi") });
    expect(refused.status).toBe(400);
  });

  test("rename and delete stay on the owner's threads", async () => {
    const ctx = as("u1");
    const a = await call(appRouter.threads.create, { text: "mine" }, { context: ctx });
    await expect(
      call(appRouter.threads.rename, { id: a.id, title: "renamed" }, { context: as("u2") }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call(appRouter.threads.rename, { id: a.id, title: "   " }, { context: ctx }),
    ).rejects.toBeTruthy();

    const renamed = await call(
      appRouter.threads.rename,
      { id: a.id, title: "  renamed  " },
      { context: ctx },
    );
    expect(renamed.title).toBe("renamed");
    expect(renamed.titledAt).toBeInstanceOf(Date);
    expect(
      (await call(appRouter.threads.list, undefined, { context: ctx })).find((t) => t.id === a.id)
        ?.title,
    ).toBe("renamed");

    await expect(
      call(appRouter.threads.delete, { id: a.id }, { context: as("u2") }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await call(appRouter.threads.get, { id: a.id }, { context: ctx })).toMatchObject({
      id: a.id,
    });
    await call(appRouter.threads.delete, { id: a.id }, { context: ctx });
    await expect(call(appRouter.threads.get, { id: a.id }, { context: ctx })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    expect(await call(appRouter.threads.list, undefined, { context: ctx })).not.toContainEqual(
      expect.objectContaining({ id: a.id }),
    );
  });

  test("POST /api/chat streams the answer, and threads.get returns the stored UIMessages", async () => {
    const ctx = as("u1");
    const gemini = (await base.credentials.list()).find((c) => c.type === "gemini")!;
    await call(
      appRouter.models.select,
      { connectionId: gemini.id, modelId: "gemini-3.5-flash" },
      { context: ctx },
    );
    const thread = await call(
      appRouter.threads.create,
      { text: "  a\n  long\tmessage " },
      { context: ctx },
    );
    expect(thread.title).toBe("a long message");

    expect((await chat(ctx, { message: userMessage("hi") })).status).toBe(400);

    const response = await chat(ctx, { id: thread.id, message: userMessage("hi", "first") });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const types = (await chunksOf(response)).map((c) => c.type);
    expect(types[0]).toBe("start");
    expect(types).toContain("data-spec");
    expect(types.at(-1)).toBe("finish");

    // Another user cannot send into this thread.
    await call(
      appRouter.models.select,
      { connectionId: gemini.id, modelId: "gemini-3.5-flash" },
      { context: as("u2") },
    );
    expect((await chat(as("u2"), { id: thread.id, message: userMessage("hi") })).status).toBe(404);

    const got = await call(appRouter.threads.get, { id: thread.id }, { context: ctx });
    expect(got.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(got.messages[0]).toEqual({
      id: "first",
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    });
    const answer = got.messages[1]!;
    expect(answer.metadata).toEqual({ connectionId: gemini.id, modelId: "gemini-3.5-flash" });
    expect(answer.parts.find((p) => p.type === "text")).toMatchObject({ text: "Hi.\n\n" });
    expect(answer.parts.filter((p) => p.type === "data-spec")).toHaveLength(3);
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
