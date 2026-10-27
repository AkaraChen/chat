// Runs the real CLIProxyAPI from @cpajs/cpa. One proxy for the whole file.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { authFileName } from "./auths";
import type { CpaServer } from "@cpajs/cpa/server";

import { seedOf } from "./auths";
import { startProxy } from "./server";

type Hit = { path: string; auth: string | null; model: string };

// Records requests and answers with a minimal chat completion.
function fakeUpstream() {
  const hits: Hit[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = (await request.json().catch(() => ({}))) as { model?: string };
      hits.push({
        path: new URL(request.url).pathname,
        auth: request.headers.get("authorization"),
        model: body.model ?? "",
      });
      return Response.json({
        id: "c",
        object: "chat.completion",
        created: 1,
        model: body.model,
        choices: [
          { index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    },
  });
  return { url: server.url.href.replace(/\/$/, ""), hits, stop: () => server.stop(true) };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

const signIn = {
  type: "openai",
  method: "oauth",
  email: "me@example.com",
  account_id: "acct-9",
  api_key: "",
  access_token: "at",
  refresh_token: "rt-1",
  id_token: "it",
  expires_at: "2099-10-26T00:00:00Z",
  plan_type: "plus",
};

const legacySignIn = { ...signIn, account_id: "acct-legacy", refresh_token: "rt-legacy-seed" };

const ACCESS_KEY = "internal-key";
let credDir: string;
let dataDir: string;
let base: string;
let proxy: CpaServer;
let settings: Parameters<typeof startProxy>[0];
const upA = fakeUpstream();
const upB = fakeUpstream();

async function writeCred(id: string, body: object) {
  await writeFile(path.join(credDir, `${id}.json`), JSON.stringify(body), { mode: 0o600 });
}

function keyCred(type: string, key: string, baseUrl: string, models: string[]) {
  return {
    type,
    method: "api_key",
    email: "",
    account_id: "",
    api_key: key,
    base_url: baseUrl,
    access_token: "",
    refresh_token: "",
    expires_at: "",
    models: models.map((name) => ({ name, alias: name, display_name: name })),
  };
}

async function call(method: string, route: string, key: string, body?: object) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, text: await response.text() };
}

async function modelIds(): Promise<string[]> {
  const { status, text } = await call("GET", "/v1/models", ACCESS_KEY);
  if (status !== 200) return [];
  return (JSON.parse(text) as { data: { id: string }[] }).data.map((m) => m.id);
}

async function waitModel(id: string, want: boolean): Promise<string[]> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const ids = await modelIds();
    if (ids.includes(id) === want) return ids;
    if (Date.now() > deadline) throw new Error(`${id} present=${!want} never changed: ${ids}`);
    await Bun.sleep(200);
  }
}

const chat = (model: string, key = ACCESS_KEY) =>
  call("POST", "/v1/chat/completions", key, { model, messages: [{ role: "user", content: "hi" }] });

beforeAll(async () => {
  credDir = await mkdtemp(path.join(tmpdir(), "proxy-cred-"));
  dataDir = await mkdtemp(path.join(tmpdir(), "proxy-data-"));
  // Two connections expose the same model name on different upstreams.
  await writeCred("custom-aaaa0001", keyCred("custom", "key-A", upA.url, ["shared-model"]));
  await writeCred("custom-bbbb0002", keyCred("custom", "key-B", upB.url, ["shared-model"]));
  // Models synced from models.dev, as packages/api writes them.
  await writeCred("gemini-cccc0003", keyCred("gemini", "key-C", "", ["gemini-3.5-flash"]));
  await writeCred("openai-eeee0005", keyCred("openai", "key-E", "", ["gpt-5.5"]));
  // A ChatGPT sign-in: its models come from CLIProxyAPI's catalog for the plan.
  await writeCred("openai-ffff0006", signIn);
  // Someone else's auth file in CLIProxyAPI's directory is never touched.
  await Bun.write(path.join(dataDir, "auths", "codex-other.json"), "{}");
  // Files the proxy wrote before cpajs tracked them: one whose tokens
  // CLIProxyAPI has refreshed since, and one whose sign-in is gone.
  await writeCred("openai-1e9a0007", legacySignIn);
  await Bun.write(
    path.join(dataDir, "auths", authFileName("openai-1e9a0007")),
    JSON.stringify({
      type: "codex",
      refresh_token: "rt-refreshed-by-cpa",
      prefix: "openai-1e9a0007",
      chat_seed: seedOf({ id: "openai-1e9a0007", credential: legacySignIn as never }),
    }),
  );
  await Bun.write(
    path.join(dataDir, "auths", authFileName("openai-90ne0008")),
    JSON.stringify({ type: "codex", refresh_token: "rt-old", chat_seed: "0123456789abcdef" }),
  );

  settings = {
    credentialsDir: credDir,
    dataDir,
    host: "127.0.0.1",
    port: await freePort(),
    accessKey: ACCESS_KEY,
  };
  proxy = await startProxy(settings, () => {});
  base = proxy.origin;
}, 60_000);

afterAll(async () => {
  await proxy?.stop();
  upA.stop();
  upB.stop();
  await rm(credDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

describe("proxy", () => {
  test("models listing carries the prefix", async () => {
    await waitModel("custom-bbbb0002/shared-model", true);
    const ids = await waitModel("openai-ffff0006/gpt-6-sol", true);
    for (const want of [
      "custom-aaaa0001/shared-model",
      "custom-bbbb0002/shared-model",
      "gemini-cccc0003/gemini-3.5-flash",
      "openai-eeee0005/gpt-5.5",
      "openai-ffff0006/gpt-6-sol",
    ]) {
      expect(ids).toContain(want);
    }
    // force-model-prefix is on, so bare ids are not listed.
    expect(ids).not.toContain("shared-model");
    expect(ids).not.toContain("gpt-5.5");
    // A key lists only its synced models, not the whole catalog.
    expect(ids.filter((id) => id.startsWith("openai-eeee0005/"))).toEqual([
      "openai-eeee0005/gpt-5.5",
    ]);
  }, 40_000);

  test("a second start in the process returns the running proxy", async () => {
    expect(await startProxy(settings, () => {})).toBe(proxy);
  });

  test("files from before cpajs are adopted, not overwritten, and pruned when gone", async () => {
    const client = proxy.client();
    const kept = JSON.parse(
      await (await client.credentials.download(authFileName("openai-1e9a0007"))).text(),
    );
    expect(kept.refresh_token).toBe("rt-refreshed-by-cpa");
    expect(kept["x-cpajs"]).toEqual({
      owner: "chat",
      revision: seedOf({ id: "openai-1e9a0007", credential: legacySignIn as never }),
    });
    expect(kept).not.toHaveProperty("chat_seed");
    const { files } = await client.credentials.list();
    expect(files.map((f) => f.name)).not.toContain(authFileName("openai-90ne0008"));
  });

  test("routes to the named connection", async () => {
    expect((await chat("custom-aaaa0001/shared-model")).status).toBe(200);
    expect((await chat("custom-bbbb0002/shared-model")).status).toBe(200);
    expect(upA.hits).toEqual([
      { path: "/chat/completions", auth: "Bearer key-A", model: "shared-model" },
    ]);
    expect(upB.hits.map((h) => h.auth)).toEqual(["Bearer key-B"]);
  });

  test("rejects a missing or wrong key", async () => {
    const before = upA.hits.length;
    expect((await chat("custom-aaaa0001/shared-model", "")).status).toBe(401);
    expect((await chat("custom-aaaa0001/shared-model", "wrong")).status).toBe(401);
    expect((await call("GET", "/v1/models", "")).status).toBe(401);
    expect(upA.hits.length).toBe(before);
  });

  test("an unprefixed model does not route", async () => {
    expect((await chat("shared-model")).status).not.toBe(200);
  });

  test("the sign-in's auth file is kept once refreshed, replaced on a new sign-in", async () => {
    const client = proxy.client();
    const name = authFileName("openai-ffff0006");
    const read = async () => JSON.parse(await (await client.credentials.download(name)).text());

    // CLIProxyAPI refreshes the tokens in place; a sync leaves them.
    const refreshed = { ...(await read()), refresh_token: "rt-rotated" };
    await client.credentials.upload({ name, content: JSON.stringify(refreshed) });
    await writeCred("custom-aaaa0001", keyCred("custom", "key-A", upA.url, ["shared-model"]));
    await Bun.sleep(1000);
    expect((await read()).refresh_token).toBe("rt-rotated");

    // Signing in again replaces it.
    await writeCred("openai-ffff0006", { ...signIn, refresh_token: "rt-2" });
    const deadline = Date.now() + 10_000;
    while ((await read()).refresh_token !== "rt-2") {
      if (Date.now() > deadline) throw new Error("a new sign-in must replace the file");
      await Bun.sleep(200);
    }
  }, 20_000);

  test("signing out removes the account's models and only its auth file", async () => {
    await rm(path.join(credDir, "openai-ffff0006.json"));
    await waitModel("openai-ffff0006/gpt-6-sol", false);
    const { files } = await proxy.client().credentials.list();
    const names = files.map((f) => f.name);
    expect(names).not.toContain(authFileName("openai-ffff0006"));
    expect(names).toContain("codex-other.json");
  }, 40_000);

  test("a crashed CLIProxyAPI comes back on the same handle and client", async () => {
    const client = proxy.client();
    const before = proxy.pid;
    const restarted = new Promise((resolve) => {
      const off = proxy.on("restarted", (event) => {
        off();
        resolve(event);
      });
    });
    process.kill(before, "SIGKILL");
    expect(await restarted).toMatchObject({ reason: "unexpected-exit" });
    expect(proxy.pid).not.toBe(before);
    expect((await client.credentials.list()).files.length).toBeGreaterThan(0);
    await waitModel("custom-bbbb0002/shared-model", true);
  }, 30_000);

  test("hot reload on add and delete", async () => {
    const upD = fakeUpstream();
    try {
      await writeCred("custom-dddd0004", keyCred("custom", "key-D", upD.url, ["late"]));
      await waitModel("custom-dddd0004/late", true);
      expect((await chat("custom-dddd0004/late")).status).toBe(200);
      expect(upD.hits.map((h) => h.auth)).toEqual(["Bearer key-D"]);
      await rm(path.join(credDir, "custom-dddd0004.json"));
      await waitModel("custom-dddd0004/late", false);
    } finally {
      upD.stop();
    }
  }, 70_000);
});
