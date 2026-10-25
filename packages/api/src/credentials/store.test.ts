import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";

import { createCredentialStore, fileNameFor, type Credential } from "./store";

function credential(overrides: Partial<Credential> = {}): Credential {
  return {
    type: "gemini",
    method: "api_key",
    email: "",
    account_id: "",
    api_key: "AIza-test",
    access_token: "",
    refresh_token: "",
    expires_at: "",
    ...overrides,
  };
}

describe("credential store", () => {
  test("names a file from the provider and a hash of the account", () => {
    const name = fileNameFor(credential({ account_id: "org-123" }));
    expect(name).toMatch(/^gemini-[0-9a-f]{8}\.json$/);
  });

  test("falls back to the email when there is no account id", () => {
    expect(fileNameFor(credential({ email: "a@b.co" }))).toBe("gemini-a@b.co.json");
  });

  test("saves, lists without the secret, and deletes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    const saved = await store.save(credential({ account_id: "org-123" }));

    const info = await stat(dir);
    expect(info.mode & 0o777).toBe(0o700);

    const onDisk = JSON.parse(await readFile(path.join(dir, `${saved.id}.json`), "utf8"));
    expect(onDisk.api_key).toBe("AIza-test");

    const listed = await store.list();
    expect(listed).toEqual([{ id: saved.id, type: "gemini", method: "api_key", label: "org-123" }]);
    expect(JSON.stringify(listed)).not.toContain("AIza-test");

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
    expect(Object.keys(listed[0]!).sort()).toEqual(["id", "label", "method", "provider", "type"]);
    expect(listed[0]!.provider).toBe("deepseek");
    const text = JSON.stringify(listed);
    for (const secret of ["sk-custom", "tok-secret", "ref-secret"]) {
      expect(text).not.toContain(secret);
    }
  });

  test("a key keeps its models but only custom keeps a base_url; a sign-in keeps neither", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    const key = await store.save(credential({ models: [deepseek], base_url: "https://x" }));
    const onDisk = JSON.parse(await readFile(path.join(dir, `${key.id}.json`), "utf8"));
    expect(onDisk.models).toEqual([deepseek]);
    expect(onDisk.base_url).toBeUndefined();

    const signIn = await store.save(
      credential({
        type: "openai",
        method: "oauth",
        api_key: "",
        account_id: "acct-1",
        refresh_token: "r",
        id_token: "i",
        plan_type: "plus",
        models: [deepseek],
      }),
    );
    const oauthDisk = JSON.parse(await readFile(path.join(dir, `${signIn.id}.json`), "utf8"));
    expect(oauthDisk.models).toBeUndefined();
    expect(oauthDisk).toMatchObject({ id_token: "i", plan_type: "plus", refresh_token: "r" });
  });

  test("only OpenAI signs in; any other sign-in file is ignored", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    const file = { ...credential({ method: "oauth", api_key: "" }) };
    await writeFile(path.join(dir, "gemini-abc.json"), JSON.stringify(file));
    await writeFile(
      path.join(dir, "claude-abc.json"),
      JSON.stringify({ ...file, type: "claude", method: "api_key" }),
    );
    expect(await store.list()).toEqual([]);
  });

  test("a model added by hand keeps its mark", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    const manual = { name: "x-preview", alias: "x-preview", display_name: "X", manual: true };
    const saved = await store.save(custom({ models: [deepseek, manual] }));
    expect((await store.get(saved.id))?.models).toEqual([deepseek, manual]);
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

  test("setModels refuses unknown ids and sign-ins", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "auths-"));
    const store = createCredentialStore(dir);
    const saved = await store.save(
      credential({ type: "openai", method: "oauth", api_key: "", account_id: "acct-1" }),
    );
    expect(await store.setModels(saved.id, [deepseek])).toBeNull();
    expect(await store.setModels("nope", [deepseek])).toBeNull();
    expect(await store.get("../escape")).toBeNull();
  });
});
