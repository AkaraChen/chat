import type { Credential, CredentialModel, CredentialStore } from "../credentials/store";
import type { ModelsDevCatalog, ModelsDevEntry } from "./models-dev";

/** The models.dev entry a connection takes its models from, if any. */
export function catalogEntryOf(
  catalog: ModelsDevCatalog,
  credential: Pick<Credential, "type" | "provider">,
): ModelsDevEntry | null {
  switch (credential.type) {
    case "openai":
      return catalog.openai;
    case "gemini":
      return catalog.gemini;
    case "openrouter":
      return catalog.openrouter;
    case "custom":
      return catalog.custom.find((entry) => entry.id === credential.provider) ?? null;
  }
}

/**
 * A connection's models after a sync: everything models.dev lists for its
 * provider, then the models added by hand that models.dev does not list.
 * A model models.dev drops goes too, unless it was added by hand.
 */
export function syncedModels(entry: ModelsDevEntry, current: CredentialModel[]): CredentialModel[] {
  const listed = new Set(entry.models.map((model) => model.id));
  return [
    ...entry.models.map((model) => ({ name: model.id, alias: model.id, display_name: model.name })),
    ...current.filter((model) => model.manual && !listed.has(model.name)),
  ];
}

const sameModels = (a: CredentialModel[], b: CredentialModel[]) =>
  JSON.stringify(a) === JSON.stringify(b);

export type SyncResult = { connectionId: string; models: number; changed: boolean };

/**
 * Brings each API-key connection's models in line with `catalog`. A ChatGPT
 * sign-in has no list of its own (the proxy knows what the plan offers), and
 * a connection models.dev has no entry for keeps what it has. Files are only
 * rewritten when the list changed, so the proxy does not reload for nothing.
 * `only` limits the sync to one connection.
 */
export async function syncConnectionModels(
  credentials: CredentialStore,
  catalog: ModelsDevCatalog,
  only?: string,
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const summary of await credentials.list()) {
    if (only !== undefined && summary.id !== only) continue;
    const credential = await credentials.get(summary.id);
    if (!credential || credential.method !== "api_key") continue;
    const entry = catalogEntryOf(catalog, credential);
    if (!entry) continue;
    const current = credential.models ?? [];
    const next = syncedModels(entry, current);
    const changed = !sameModels(current, next);
    if (changed) await credentials.setModels(summary.id, next);
    results.push({ connectionId: summary.id, models: next.length, changed });
  }
  return results;
}
