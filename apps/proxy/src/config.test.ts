import { describe, expect, test } from "bun:test";

import type { Credential } from "@my-better-t-app/api/credentials/store";

import { authFileName, codexAuth, planAuths, seedOf } from "./auths";
import { type Connection, apiKeysOf, configOf } from "./config";

function connection(id: string, overrides: Partial<Credential>): Connection {
  return {
    id,
    credential: {
      type: "gemini",
      method: "api_key",
      email: "",
      account_id: "",
      api_key: "",
      access_token: "",
      refresh_token: "",
      expires_at: "",
      ...overrides,
    },
  };
}

const signIn = connection("openai-ffff0006", {
  type: "openai",
  method: "oauth",
  email: "me@example.com",
  account_id: "acct-9",
  access_token: "at",
  refresh_token: "rt-1",
  id_token: "it",
  expires_at: "2026-10-26T00:00:00Z",
  plan_type: "plus",
});

const fixture: Connection[] = [
  connection("openai-bbbb2222", {
    type: "openai",
    api_key: "sk-oa",
    models: [{ name: "gpt-5.5", alias: "gpt-5.5", display_name: "GPT-5.5" }],
  }),
  connection("gemini-cccc3333", {
    api_key: "g-key",
    models: [
      { name: "gemini-3.5-flash", alias: "gemini-3.5-flash", display_name: "Gemini 3.5 Flash" },
      { name: "gemini-3.5-pro", alias: "gemini-3.5-pro", display_name: "Gemini 3.5 Pro" },
    ],
  }),
  signIn,
  connection("openrouter-dddd4444", {
    type: "openrouter",
    api_key: "sk-or",
    models: [{ name: "moonshotai/kimi-k2", alias: "kimi", display_name: "Kimi K2" }],
  }),
  connection("custom-eeee5555", {
    type: "custom",
    provider: "deepseek",
    api_key: "sk-ds",
    base_url: "https://api.deepseek.com",
    models: [{ name: "deepseek-chat", alias: "deepseek-chat", display_name: "DeepSeek Chat" }],
  }),
  // Skipped: an empty key, a custom connection with no base URL.
  connection("gemini-empty", { api_key: " " }),
  connection("custom-nobase", { type: "custom", api_key: "k", base_url: "" }),
];

describe("apiKeysOf", () => {
  test("one prefixed group per API-key connection", () => {
    const apiKeys = apiKeysOf(fixture);
    expect(apiKeys.codex).toEqual([
      {
        name: "openai-bbbb2222",
        prefix: "openai-bbbb2222",
        "base-url": "https://api.openai.com/v1",
        models: [{ name: "gpt-5.5", alias: "gpt-5.5", "display-name": "GPT-5.5" }],
        keys: [{ "api-key": "sk-oa" }],
      },
    ]);
    expect(apiKeys.gemini?.map((g) => [g.prefix, g.models?.length, g["base-url"]])).toEqual([
      ["gemini-cccc3333", 2, undefined],
    ]);
    expect(apiKeys["openai-compatibility"]?.map((g) => [g.prefix, g["base-url"]])).toEqual([
      ["openrouter-dddd4444", "https://openrouter.ai/api/v1"],
      ["custom-eeee5555", "https://api.deepseek.com"],
    ]);
    expect(apiKeys["openai-compatibility"]?.[0]?.models).toEqual([
      { name: "moonshotai/kimi-k2", alias: "kimi", "display-name": "Kimi K2" },
    ]);
  });

  test("the sign-in is an auth file, not a group", () => {
    const prefixes = Object.values(apiKeysOf(fixture)).flatMap((groups) =>
      (groups ?? []).map((g) => g.prefix),
    );
    expect(prefixes).not.toContain("openai-ffff0006");
  });

  test("an empty directory still names every section", () => {
    expect(apiKeysOf([])).toEqual({ codex: [], gemini: [], "openai-compatibility": [] });
  });
});

test("configOf forces the prefix and accepts only the access key", () => {
  const config = configOf([], {
    host: "127.0.0.1",
    port: 8317,
    accessKey: "internal",
    authDir: "/data/proxy/auths",
  });
  expect(config.server).toEqual({ host: "127.0.0.1", port: 8317 });
  expect(config.access).toEqual({ "api-keys": ["internal"] });
  expect(config.oauth).toEqual({ "auth-dir": "/data/proxy/auths" });
  expect(config.routing).toEqual({ "force-model-prefix": true });
  expect(config.management).toEqual({ "disable-control-panel": true });
});

describe("auth files", () => {
  test("a sign-in becomes a Codex auth file with its prefix and seed", () => {
    const auth = codexAuth(signIn, new Date("2026-10-25T00:00:00.123Z"));
    expect(auth).toMatchObject({
      type: "codex",
      prefix: "openai-ffff0006",
      email: "me@example.com",
      account_id: "acct-9",
      refresh_token: "rt-1",
      id_token: "it",
      expired: "2026-10-26T00:00:00Z",
      last_refresh: "2026-10-25T00:00:00Z",
      plan_type: "plus",
    });
    // Same seed the Go proxy wrote, so files from before the switch are kept.
    expect(auth.chat_seed).toBe("a33d8c625833429d");
  });

  test("plan: upload missing or stale, keep current, remove gone, ignore foreign", () => {
    const name = authFileName(signIn.id);
    expect(planAuths(new Map(), [signIn])).toEqual({ upload: [signIn], remove: [] });
    expect(planAuths(new Map([[name, seedOf(signIn)]]), [signIn])).toEqual({
      upload: [],
      remove: [],
    });
    expect(planAuths(new Map([[name, "earlier"]]), [signIn]).upload).toEqual([signIn]);
    expect(planAuths(new Map([[name, undefined]]), [signIn]).upload).toEqual([signIn]);
    expect(
      planAuths(
        new Map([
          [name, seedOf(signIn)],
          ["codex-other.json", undefined],
        ]),
        [],
      ),
    ).toEqual({ upload: [], remove: [name] });
  });
});
