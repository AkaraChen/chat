import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";

import { createCredentialStore, type Credential } from "../credentials/store";
import type { ModelsDevCatalog } from "./models-dev";
import { syncConnectionModels } from "./sync";

const entry = (id: string, models: string[]) => ({
  id,
  name: id,
  api: "",
  models: models.map((m) => ({ id: m, name: m.toUpperCase() })),
});

const catalog: ModelsDevCatalog = {
  openai: entry("openai", ["gpt-5.5"]),
  gemini: entry("google", ["gemini-3.5-flash", "gemini-3.5-pro"]),
  openrouter: entry("openrouter", ["a/b"]),
  custom: [entry("volcengine-coding-plan", ["doubao-seed"])],
};

const key = (type: Credential["type"], extra: Partial<Credential> = {}): Credential => ({
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

async function store() {
  return createCredentialStore(path.join(await mkdtemp(path.join(tmpdir(), "sync-")), "auths"));
}

describe("syncConnectionModels", () => {
  test("every key connection gets its provider's models", async () => {
    const credentials = await store();
    const gemini = await credentials.save(key("gemini"));
    const custom = await credentials.save(key("custom", { provider: "volcengine-coding-plan" }));
    const results = await syncConnectionModels(credentials, catalog);
    expect(results).toContainEqual({ connectionId: gemini.id, models: 2, changed: true });
    expect((await credentials.get(gemini.id))?.models).toEqual([
      { name: "gemini-3.5-flash", alias: "gemini-3.5-flash", display_name: "GEMINI-3.5-FLASH" },
      { name: "gemini-3.5-pro", alias: "gemini-3.5-pro", display_name: "GEMINI-3.5-PRO" },
    ]);
    expect((await credentials.get(custom.id))?.models?.map((m) => m.name)).toEqual(["doubao-seed"]);
  });

  test("models.dev's list replaces synced models; models added by hand stay", async () => {
    const credentials = await store();
    const saved = await credentials.save(
      key("gemini", {
        models: [
          { name: "gemini-old", alias: "gemini-old", display_name: "Old" },
          { name: "gemini-mine", alias: "gemini-mine", display_name: "Mine", manual: true },
        ],
      }),
    );
    await syncConnectionModels(credentials, catalog);
    expect((await credentials.get(saved.id))?.models?.map((m) => m.name)).toEqual([
      "gemini-3.5-flash",
      "gemini-3.5-pro",
      "gemini-mine",
    ]);
  });

  test("an unchanged list is not written again", async () => {
    const credentials = await store();
    const saved = await credentials.save(key("openai"));
    await syncConnectionModels(credentials, catalog);
    const results = await syncConnectionModels(credentials, catalog);
    expect(results).toEqual([{ connectionId: saved.id, models: 1, changed: false }]);
  });

  test("a sign-in, and a provider models.dev does not know, are left alone", async () => {
    const dir = path.join(await mkdtemp(path.join(tmpdir(), "sync-")), "auths");
    const credentials = createCredentialStore(dir);
    const signIn = await credentials.save(
      key("openai", { method: "oauth", api_key: "", account_id: "acct" }),
    );
    const unknown = await credentials.save(
      key("custom", {
        provider: "gone",
        models: [{ name: "kept", alias: "kept", display_name: "Kept" }],
      }),
    );
    const before = (await stat(path.join(dir, `${unknown.id}.json`))).mtimeMs;
    expect(await syncConnectionModels(credentials, catalog)).toEqual([]);
    expect((await credentials.get(signIn.id))?.models).toBeUndefined();
    expect((await credentials.get(unknown.id))?.models?.map((m) => m.name)).toEqual(["kept"]);
    expect((await stat(path.join(dir, `${unknown.id}.json`))).mtimeMs).toBe(before);
  });

  test("`only` syncs one connection", async () => {
    const credentials = await store();
    const a = await credentials.save(key("gemini"));
    const b = await credentials.save(key("openrouter"));
    expect(
      (await syncConnectionModels(credentials, catalog, a.id)).map((r) => r.connectionId),
    ).toEqual([a.id]);
    expect((await credentials.get(b.id))?.models).toEqual([]);
  });
});
