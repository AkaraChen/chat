import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";

import { createModelsDev } from "./models-dev";

const sample = await Bun.file(new URL("./fixtures/models-dev.sample.json", import.meta.url)).text();
const DAY = 24 * 60 * 60 * 1000;

function fakeFetch(body: string = sample) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const failing = (async () => {
  throw new Error("offline");
}) as unknown as typeof fetch;

async function cachePath() {
  return path.join(await mkdtemp(path.join(tmpdir(), "models-dev-")), "models-dev.json");
}

describe("models.dev catalog", () => {
  test("keeps openai-compatible providers that have an api, plus openrouter", async () => {
    const { impl, calls } = fakeFetch();
    const dev = createModelsDev({ cachePath: await cachePath(), fetch: impl });
    const catalog = await dev.catalog();
    expect(calls).toEqual(["https://models.dev/api.json"]);
    expect(catalog.custom.map((p) => p.id)).toEqual(["deepseek"]);
    expect(catalog.custom[0]).toMatchObject({ id: "deepseek", api: "https://api.deepseek.com" });
    expect(catalog.openrouter?.api).toBe("https://openrouter.ai/api/v1");
  });

  test("keeps only tool-calling models that output text", async () => {
    const dev = createModelsDev({ cachePath: await cachePath(), fetch: fakeFetch().impl });
    const ids = (await dev.catalog()).custom[0]!.models.map((m) => m.id);
    expect(ids.sort()).toEqual(["deepseek-flash", "deepseek-v4-pro"]);
    expect(Object.keys((await dev.catalog()).custom[0]!.models[0]!).sort()).toEqual(["id", "name"]);
  });

  test("serves a fresh cache without fetching", async () => {
    const file = await cachePath();
    const first = fakeFetch();
    await createModelsDev({ cachePath: file, fetch: first.impl, now: () => 1000 }).catalog();
    const second = fakeFetch();
    const dev = createModelsDev({ cachePath: file, fetch: second.impl, now: () => 1000 + DAY - 1 });
    expect((await dev.catalog()).custom).toHaveLength(1);
    expect(second.calls).toEqual([]);
  });

  test("refreshes a cache older than a day", async () => {
    const file = await cachePath();
    await createModelsDev({ cachePath: file, fetch: fakeFetch().impl, now: () => 1000 }).catalog();
    const second = fakeFetch("{}");
    const dev = createModelsDev({ cachePath: file, fetch: second.impl, now: () => 1000 + DAY });
    expect((await dev.catalog()).custom).toEqual([]);
    expect(second.calls).toHaveLength(1);
    expect(JSON.parse(await readFile(file, "utf8")).fetchedAt).toBe(1000 + DAY);
  });

  test("falls back to the old cache when the fetch fails", async () => {
    const file = await cachePath();
    await createModelsDev({ cachePath: file, fetch: fakeFetch().impl, now: () => 1000 }).catalog();
    const dev = createModelsDev({ cachePath: file, fetch: failing, now: () => 1000 + 5 * DAY });
    expect((await dev.catalog()).custom.map((p) => p.id)).toEqual(["deepseek"]);
  });

  test("throws when there is neither a cache nor a network", async () => {
    const dev = createModelsDev({ cachePath: await cachePath(), fetch: failing });
    await expect(dev.catalog()).rejects.toThrow("offline");
  });

  test("ignores a corrupt cache file", async () => {
    const file = await cachePath();
    await writeFile(file, "not json");
    const dev = createModelsDev({ cachePath: file, fetch: fakeFetch().impl });
    expect((await dev.catalog()).custom).toHaveLength(1);
  });
});
