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
    expect(listed).toEqual([
      { id: saved.id, type: "claude", method: "api_key", label: "org-123" },
    ]);
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
});
