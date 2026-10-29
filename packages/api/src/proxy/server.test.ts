// Runs the real CLIProxyAPI from @cpajs/cpa. One proxy for the whole file.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { authFileName, seedOf } from "./auths";
import { type Proxy, start, supervise } from "./server";

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

const ACCESS_KEY = "internal-key";
let credDir: string;
let dataDir: string;
let base: string;
let proxy: Proxy;
const upA = fakeUpstream();
const upB = fakeUpstream();

const refreshedSignIn = { ...signIn, account_id: "acct-refreshed", refresh_token: "rt-first" };
const resignedIn = { ...signIn, account_id: "acct-again", refresh_token: "rt-new-sign-in" };

const asConnection = (id: string, credential: object) => ({ id, credential }) as never;

// An auth file the proxy wrote earlier, as CLIProxyAPI leaves it.
async function writeAuth(id: string, refreshToken: string, seed: string) {
  await Bun.write(
    path.join(dataDir, "auths", authFileName(id)),
    JSON.stringify({ type: "codex", refresh_token: refreshToken, prefix: id, chat_seed: seed }),
  );
}

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
  // Auth files already on disk, as in production: one whose tokens CLIProxyAPI
  // has refreshed since it was written, one from an earlier sign-in to an
  // account that signed in again, and one whose sign-in is gone.
  await writeCred("openai-1e9a0007", refreshedSignIn);
  await writeAuth(
    "openai-1e9a0007",
    "rt-refreshed-by-cpa",
    seedOf(asConnection("openai-1e9a0007", refreshedSignIn)),
  );
  await writeCred("openai-5eed0009", resignedIn);
  await writeAuth(
    "openai-5eed0009",
    "rt-earlier",
    seedOf(asConnection("openai-5eed0009", { ...resignedIn, refresh_token: "rt-earlier" })),
  );
  await writeAuth("openai-90ne0008", "rt-old", "0123456789abcdef");

  proxy = await start(
    {
      credentialsDir: credDir,
      dataDir,
      host: "127.0.0.1",
      port: await freePort(),
      accessKey: ACCESS_KEY,
    },
    () => {},
  );
  base = proxy.server.origin;
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
    const client = proxy.server.client();
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
    const { files } = await proxy.server.client().credentials.list();
    const names = files.map((f) => f.name);
    expect(names).not.toContain(authFileName("openai-ffff0006"));
    expect(names).toContain("codex-other.json");
  }, 40_000);

  test("auth files on disk keep CLIProxyAPI's tokens unless the sign-in changed", async () => {
    const client = proxy.server.client();
    const read = async (id: string) =>
      JSON.parse(await (await client.credentials.download(authFileName(id))).text());
    expect((await read("openai-1e9a0007")).refresh_token).toBe("rt-refreshed-by-cpa");
    expect((await read("openai-5eed0009")).refresh_token).toBe("rt-new-sign-in");
    const { files } = await client.credentials.list();
    expect(files.map((f) => f.name)).not.toContain(authFileName("openai-90ne0008"));
  });

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

test("a crashed CLIProxyAPI is started again", async () => {
  const cred = await mkdtemp(path.join(tmpdir(), "proxy-cred-"));
  const data = await mkdtemp(path.join(tmpdir(), "proxy-data-"));
  const settings = {
    credentialsDir: cred,
    dataDir: data,
    host: "127.0.0.1",
    port: await freePort(),
    accessKey: ACCESS_KEY,
  };
  const original = console.error;
  console.error = () => {};
  const supervised = await supervise(settings, () => {});
  try {
    const before = supervised.server.pid;
    process.kill(before, "SIGKILL");
    const deadline = Date.now() + 20_000;
    while (supervised.server.pid === before) {
      if (Date.now() > deadline) throw new Error("not restarted");
      await Bun.sleep(200);
    }
    const models = await fetch(`http://127.0.0.1:${settings.port}/v1/models`, {
      headers: { authorization: `Bearer ${ACCESS_KEY}` },
    });
    expect(models.status).toBe(200);
  } finally {
    console.error = original;
    await supervised.stop();
    await rm(cred, { recursive: true, force: true });
    await rm(data, { recursive: true, force: true });
  }
}, 40_000);
