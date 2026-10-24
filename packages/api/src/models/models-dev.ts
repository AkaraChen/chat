import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL = "https://models.dev/api.json";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible";

export type ModelsDevProvider = { id: string; name: string; api: string };
export type ModelsDevModel = { id: string; name: string };
export type ModelsDevEntry = ModelsDevProvider & { models: ModelsDevModel[] };

// What the settings panel may pick from: `custom` for Custom connections,
// `openrouter` for OpenRouter. Only models that can call tools and write text.
export type ModelsDevCatalog = {
  custom: ModelsDevEntry[];
  openrouter: ModelsDevEntry | null;
};

export type ModelsDevOptions = {
  cachePath: string;
  fetch?: typeof fetch;
  now?: () => number;
  url?: string;
};

type Cache = { fetchedAt: number; data: Record<string, unknown> };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function usableModels(models: unknown): ModelsDevModel[] {
  const result: ModelsDevModel[] = [];
  for (const [key, value] of Object.entries(asRecord(models) ?? {})) {
    const model = asRecord(value);
    if (!model || model.tool_call !== true) continue;
    const output = asRecord(model.modalities)?.output;
    if (!Array.isArray(output) || !output.includes("text")) continue;
    const id = typeof model.id === "string" ? model.id : key;
    result.push({ id, name: typeof model.name === "string" ? model.name : id });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function entryOf(value: unknown): ModelsDevEntry | null {
  const provider = asRecord(value);
  if (!provider || typeof provider.id !== "string" || typeof provider.api !== "string") {
    return null;
  }
  return {
    id: provider.id,
    name: typeof provider.name === "string" ? provider.name : provider.id,
    api: provider.api,
    models: usableModels(provider.models),
  };
}

export function filterCatalog(data: Record<string, unknown>): ModelsDevCatalog {
  const custom: ModelsDevEntry[] = [];
  for (const value of Object.values(data)) {
    if (asRecord(value)?.npm !== OPENAI_COMPATIBLE) continue;
    const entry = entryOf(value);
    if (entry && entry.api) custom.push(entry);
  }
  custom.sort((a, b) => a.name.localeCompare(b.name));
  return { custom, openrouter: entryOf(data.openrouter) };
}

async function readCache(cachePath: string): Promise<Cache | null> {
  try {
    const value = asRecord(JSON.parse(await readFile(cachePath, "utf8")));
    if (!value || typeof value.fetchedAt !== "number" || !asRecord(value.data)) return null;
    return { fetchedAt: value.fetchedAt, data: value.data as Record<string, unknown> };
  } catch {
    return null;
  }
}

async function writeCache(cachePath: string, cache: Cache) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  // Rename so a reader never sees half a file.
  const tmp = `${cachePath}.tmp`;
  await writeFile(tmp, JSON.stringify(cache));
  await rename(tmp, cachePath);
}

export type ModelsDev = {
  catalog(): Promise<ModelsDevCatalog>;
};

export function createModelsDev(options: ModelsDevOptions): ModelsDev {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const url = options.url ?? SOURCE_URL;

  let memo: { fetchedAt: number; catalog: ModelsDevCatalog } | null = null;
  let inflight: Promise<ModelsDevCatalog> | null = null;

  async function download(): Promise<Cache> {
    const response = await doFetch(url);
    if (!response.ok) throw new Error(`models.dev responded ${response.status}`);
    const data = asRecord(await response.json());
    if (!data) throw new Error("models.dev returned an unexpected body");
    const cache = { fetchedAt: now(), data };
    await writeCache(options.cachePath, cache);
    return cache;
  }

  async function load(): Promise<ModelsDevCatalog> {
    let cache = memo ? null : await readCache(options.cachePath);
    const fetchedAt = memo?.fetchedAt ?? cache?.fetchedAt;
    if (fetchedAt === undefined || now() - fetchedAt >= MAX_AGE_MS) {
      try {
        cache = await download();
      } catch (error) {
        // An old cache beats no catalog.
        if (!memo && !cache) throw error;
      }
    }
    if (cache) memo = { fetchedAt: cache.fetchedAt, catalog: filterCatalog(cache.data) };
    return memo!.catalog;
  }

  return {
    catalog() {
      inflight ??= load().finally(() => {
        inflight = null;
      });
      return inflight;
    },
  };
}
