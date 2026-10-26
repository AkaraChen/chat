import type { CpaConfig } from "@cpajs/cpa/client";
import type { Credential, CredentialModel } from "@my-better-t-app/api/credentials/store";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
// CLIProxyAPI drops codex groups that have no base-url.
const OPENAI_BASE_URL = "https://api.openai.com/v1";

/** A credential file and its connection id (the file name without `.json`). */
export type Connection = { id: string; credential: Credential };

export type ApiKeys = NonNullable<CpaConfig["api-keys"]>;

export type Options = { host: string; port: number; accessKey: string; authDir: string };

export function isApiKey({ credential }: Connection): boolean {
  return credential.method === "api_key" && credential.api_key.trim() !== "";
}

/** A ChatGPT sign-in, which the proxy serves as a Codex auth file. Only OpenAI signs in. */
export function isSignIn({ credential }: Connection): boolean {
  return (
    credential.type === "openai" &&
    credential.method === "oauth" &&
    credential.refresh_token.trim() !== ""
  );
}

function refs(models: CredentialModel[] = []) {
  return models
    .filter((m) => m.name)
    .map((m) => ({
      name: m.name,
      alias: m.alias || m.name,
      ...(m.display_name ? { "display-name": m.display_name } : {}),
    }));
}

// Every API-key connection becomes its own group with prefix == connection id
// and force-model-prefix on, so a request can only reach the connection it
// names. A ChatGPT sign-in is not a group; it is an auth file (see auths.ts).
// There is no model catalog: a group lists its models (synced from models.dev
// by packages/api), and a sign-in gets CLIProxyAPI's catalog for its plan.
export function apiKeysOf(connections: Connection[]): ApiKeys {
  const apiKeys: Required<Pick<ApiKeys, "codex" | "gemini" | "openai-compatibility">> = {
    codex: [],
    gemini: [],
    "openai-compatibility": [],
  };
  for (const connection of connections) {
    if (!isApiKey(connection)) continue;
    const { id, credential } = connection;
    const models = refs(credential.models);
    const group = {
      name: id,
      prefix: id,
      ...(models.length > 0 ? { models } : {}),
      keys: [{ "api-key": credential.api_key }],
    };
    switch (credential.type) {
      case "openai":
        apiKeys.codex.push({ ...group, "base-url": OPENAI_BASE_URL });
        break;
      case "gemini":
        apiKeys.gemini.push(group);
        break;
      case "openrouter":
        apiKeys["openai-compatibility"].push({ ...group, "base-url": OPENROUTER_BASE_URL });
        break;
      case "custom":
        if (!credential.base_url) break;
        apiKeys["openai-compatibility"].push({ ...group, "base-url": credential.base_url });
        break;
    }
  }
  return apiKeys;
}

/** The whole config, written when the proxy starts. Later changes go through the management API. */
export function configOf(connections: Connection[], options: Options): CpaConfig {
  return {
    "config-version": 8,
    server: { host: options.host, port: options.port },
    // cpajs adds the generated key. Only this process uses the management API,
    // so CLIProxyAPI need not fetch and serve its web panel.
    management: { "disable-control-panel": true },
    access: { "api-keys": [options.accessKey] },
    oauth: { "auth-dir": options.authDir },
    routing: { "force-model-prefix": true },
    "api-keys": apiKeysOf(connections),
  };
}
