import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";

import { createCredentialStore, fileNameFor, type Credential } from "./store";

function credential(overrides: Partial<Credential> = {}): Credential {
  return {
    type: "claude",
    method: "api_key",
    email: "",
    account_id: "",
    api_key: "sk-ant-test",
    access_token: "",
    refresh_token: "",
    expires_at: "",
    ...overrides,
  };
}

describe("credential store", () => {
  test("names a file from the provider and a hash of the account", () => {
    const name = fileNameFor(credential({ account_id: "org-123" }));
    expect(name).toMatch(/^claude-[0-9a-f]{8}\.json$/);
  });

  test("falls back to the email when there is no account id", () => {
    expect(fileNameFor(credential({ email: "a@b.co" }))).toBe("claude-a@b.co.json");
  });

  test("saves, lists without the secret, and deletes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    const saved = await store.save(credential({ account_id: "org-123" }));

    const info = await stat(dir);
    expect(info.mode & 0o777).toBe(0o700);

    const onDisk = JSON.parse(await readFile(path.join(dir, `${saved.id}.json`), "utf8"));
    expect(onDisk.api_key).toBe("sk-ant-test");

    const listed = await store.list();
    expect(listed).toEqual([{ id: saved.id, type: "claude", method: "api_key", label: "org-123" }]);
    expect(JSON.stringify(listed)).not.toContain("sk-ant-test");

    await store.delete(saved.id);
    expect(await store.list()).toEqual([]);
  });

  test("refuses to delete outside the directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    await store.delete("../escape");
    expect(await store.list()).toEqual([]);
  });

  test("saving the same connection again replaces the file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    const first = await store.save(credential({ account_id: "org-123", api_key: "old" }));
    const second = await store.save(credential({ account_id: "org-123", api_key: "new" }));
    expect(second.id).toBe(first.id);
    const onDisk = JSON.parse(await readFile(path.join(dir, `${first.id}.json`), "utf8"));
    expect(onDisk.api_key).toBe("new");
    expect(await store.list()).toHaveLength(1);
  });

  const deepseek = {
    name: "deepseek-flash",
    alias: "deepseek-flash",
    display_name: "DeepSeek Flash",
  };

  function custom(overrides: Partial<Credential> = {}): Credential {
    return credential({
      type: "custom",
      provider: "deepseek",
      api_key: "sk-custom",
      base_url: "https://api.deepseek.com",
      models: [deepseek],
      ...overrides,
    });
  }

  test("custom models, base_url and provider round-trip", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    const saved = await store.save(custom());
    const onDisk = JSON.parse(await readFile(path.join(dir, `${saved.id}.json`), "utf8"));
    expect(onDisk.provider).toBe("deepseek");
    expect(onDisk.base_url).toBe("https://api.deepseek.com");
    expect(onDisk.models).toEqual([deepseek]);
    expect(await store.get(saved.id)).toEqual(custom());
    expect(saved.label).toBe("deepseek");
  });

  test("the same key against another base_url is a second file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    const a = await store.save(custom());
    const b = await store.save(custom({ base_url: "https://other.example/v1" }));
    expect(a.id).not.toBe(b.id);
    expect(await store.list()).toHaveLength(2);
  });

  test("list never includes secrets", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    await store.save(custom({ access_token: "tok-secret", refresh_token: "ref-secret" }));
    const listed = await store.list();
    expect(Object.keys(listed[0]!).sort()).toEqual(["id", "label", "method", "type"]);
    const text = JSON.stringify(listed);
    for (const secret of ["sk-custom", "tok-secret", "ref-secret"]) {
      expect(text).not.toContain(secret);
    }
  });

  test("models fields are dropped for types that do not take them", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    const saved = await store.save(credential({ models: [deepseek], base_url: "https://x" }));
    const onDisk = JSON.parse(await readFile(path.join(dir, `${saved.id}.json`), "utf8"));
    expect(onDisk.models).toBeUndefined();
    expect(onDisk.base_url).toBeUndefined();
  });

  test("setModels rewrites the same file and keeps the key", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    const saved = await store.save(custom());
    const next = { name: "m2", alias: "m2", display_name: "M Two" };
    await store.setModels(saved.id, [deepseek, next]);
    expect(await store.list()).toHaveLength(1);
    const got = await store.get(saved.id);
    expect(got?.models).toEqual([deepseek, next]);
    expect(got?.api_key).toBe("sk-custom");
  });

  test("setModels refuses unknown ids and types without models", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    const saved = await store.save(credential());
    expect(await store.setModels(saved.id, [deepseek])).toBeNull();
    expect(await store.setModels("nope", [deepseek])).toBeNull();
    expect(await store.get("../escape")).toBeNull();
  });
});
