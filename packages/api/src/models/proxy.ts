import type { CredentialStore, CredentialSummary } from "../credentials/store";

export type ProxyOptions = {
  proxyUrl: string;
  apiKey: string;
  credentials: CredentialStore;
  fetch?: typeof fetch;
};

/** `manual` marks a model added by hand; the rest come from models.dev. */
export type ConnectionModel = { id: string; name: string; manual?: true };

export type ConnectionModels = {
  connectionId: string;
  type: CredentialSummary["type"];
  label: string;
  models: ConnectionModel[];
};

type ProxyModel = { id: string; display_name?: string };

// A ChatGPT sign-in lists what CLIProxyAPI's catalog has for the plan, which
// includes models a chat cannot use: image generation and Codex's internal
// review model. The catalog has no capability field, so they go by name.
const NOT_FOR_CHAT = /^(gpt-image|codex-auto-review)/;

// The proxy names a model `<connectionId>/<model>`: the connection's prefix
// followed by the upstream name. This is the one place that knows the format.
export function splitModelId(id: string): { connectionId: string; modelId: string } | null {
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1) return null;
  return { connectionId: id.slice(0, slash), modelId: id.slice(slash + 1) };
}

async function fetchProxyModels(options: ProxyOptions): Promise<ProxyModel[]> {
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(`${options.proxyUrl.replace(/\/+$/, "")}/v1/models`, {
    headers: { authorization: `Bearer ${options.apiKey}` },
  });
  if (!response.ok) throw new Error(`proxy responded ${response.status} for /v1/models`);
  const body = (await response.json()) as { data?: unknown };
  if (!Array.isArray(body.data)) return [];
  const models: ProxyModel[] = [];
  for (const item of body.data) {
    if (typeof item?.id !== "string") continue;
    models.push({
      id: item.id,
      display_name: typeof item.display_name === "string" ? item.display_name : undefined,
    });
  }
  return models;
}

// Models the proxy serves, grouped by connection. Connections that no longer
// have a credential file are dropped, as are connections with no models.
export async function listConnectionModels(options: ProxyOptions): Promise<ConnectionModels[]> {
  const [proxyModels, summaries] = await Promise.all([
    fetchProxyModels(options),
    options.credentials.list(),
  ]);

  const signIns = new Set(summaries.filter((s) => s.method === "oauth").map((s) => s.id));
  const groups = new Map<string, ConnectionModels>(
    summaries.map((s) => [s.id, { connectionId: s.id, type: s.type, label: s.label, models: [] }]),
  );
  const stored = new Map(
    await Promise.all(
      summaries.map(
        async (s) => [s.id, (await options.credentials.get(s.id))?.models ?? []] as const,
      ),
    ),
  );

  for (const model of proxyModels) {
    const parts = splitModelId(model.id);
    const group = parts && groups.get(parts.connectionId);
    if (!parts || !group) continue;
    if (signIns.has(parts.connectionId) && NOT_FOR_CHAT.test(parts.modelId)) continue;
    const known = stored
      .get(parts.connectionId)
      ?.find((m) => m.alias === parts.modelId || m.name === parts.modelId);
    group.models.push({
      id: parts.modelId,
      name: known?.display_name || model.display_name || parts.modelId,
      ...(known?.manual ? { manual: true as const } : {}),
    });
  }
  return [...groups.values()].filter((group) => group.models.length > 0);
}
