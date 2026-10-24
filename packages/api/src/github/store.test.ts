import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";

import { createGithubStore } from "./store";

describe("github store", () => {
  test("saves with private modes, reads, and clears", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gh-"));
    const file = path.join(root, "data", "github.json");
    const store = createGithubStore(file);

    expect(await store.get()).toBe(false);
    expect(await store.read()).toBeNull();

    await store.save(" ghp_abc ");
    expect(await store.get()).toBe(true);
    expect(await store.read()).toBe("ghp_abc");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(path.dirname(file))).mode & 0o777).toBe(0o700);

    await store.clear();
    expect(await store.get()).toBe(false);
    await store.clear();
  });
});
