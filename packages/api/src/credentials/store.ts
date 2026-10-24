import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const providerSlugs = ["claude", "openai", "gemini", "openrouter", "custom"] as const;

export type ProviderSlug = (typeof providerSlugs)[number];

export type CredentialMethod = "oauth" | "api_key";

// One file per connection. See docs/credentials.md. The file is the only
// record of a connection, so nothing here is copied into the database.
// A model a connection offers. `name` is the id sent upstream, `alias` the
// name callers use (defaults to `name`), `display_name` what people read.
export type CredentialModel = {
  name: string;
  alias: string;
  display_name: string;
};

// `models` is for openrouter and custom; `base_url` and `provider` (the
// models.dev provider id) are for custom. Other types leave them out.
export type Credential = {
  type: ProviderSlug;
  method: CredentialMethod;
  email: string;
  account_id: string;
  api_key: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  provider?: string;
  base_url?: string;
  models?: CredentialModel[];
};

export type CredentialSummary = {
  id: string;
  type: ProviderSlug;
  method: CredentialMethod;
  label: string;
};

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

function isProviderSlug(value: unknown): value is ProviderSlug {
  return typeof value === "string" && (providerSlugs as readonly string[]).includes(value);
}

function identityOf(credential: Credential): string {
  // Same key against another endpoint is another connection.
  if (credential.type === "custom") {
    const base = credential.base_url?.trim() ?? "";
    const seed = `${base}\n${credential.account_id.trim() || credential.api_key.trim()}`;
    return createHash("sha256").update(seed).digest("hex").slice(0, 8);
  }
  const account = credential.account_id.trim();
  if (account) return createHash("sha256").update(account).digest("hex").slice(0, 8);
  const email = credential.email.trim();
  if (email) return email.replace(/[^a-z0-9.@_-]/gi, "");
  return createHash("sha256").update(credential.api_key.trim()).digest("hex").slice(0, 8);
}

export function fileNameFor(credential: Credential): string {
  return `${credential.type}-${identityOf(credential)}.json`;
}

function labelOf(credential: Credential): string {
  return (
    credential.email.trim() ||
    credential.account_id.trim() ||
    credential.provider?.trim() ||
    credential.type
  );
}

function parseModels(value: unknown): CredentialModel[] {
  if (!Array.isArray(value)) return [];
  const models: CredentialModel[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { name, alias, display_name } = item as Record<string, unknown>;
    if (typeof name !== "string" || !name) continue;
    models.push({
      name,
      alias: typeof alias === "string" && alias ? alias : name,
      display_name: typeof display_name === "string" && display_name ? display_name : name,
    });
  }
  return models;
}

// Keep only the fields a type is allowed to carry.
function normalize(credential: Credential): Credential {
  const { provider, base_url, models, ...base } = credential;
  if (credential.type === "openrouter") return { ...base, models: parseModels(models) };
  if (credential.type === "custom") {
    return {
      ...base,
      provider: provider?.trim() ?? "",
      base_url: base_url?.trim() ?? "",
      models: parseModels(models),
    };
  }
  return base;
}

function parse(raw: string, fileName: string): Credential | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!isProviderSlug(record.type)) return null;
  if (record.method !== "oauth" && record.method !== "api_key") return null;
  if (!fileName.startsWith(`${record.type}-`)) return null;
  return normalize({
    type: record.type,
    method: record.method,
    email: typeof record.email === "string" ? record.email : "",
    account_id: typeof record.account_id === "string" ? record.account_id : "",
    api_key: typeof record.api_key === "string" ? record.api_key : "",
    access_token: typeof record.access_token === "string" ? record.access_token : "",
    refresh_token: typeof record.refresh_token === "string" ? record.refresh_token : "",
    expires_at: typeof record.expires_at === "string" ? record.expires_at : "",
    provider: typeof record.provider === "string" ? record.provider : undefined,
    base_url: typeof record.base_url === "string" ? record.base_url : undefined,
    models: parseModels(record.models),
  });
}

export type CredentialStore = {
  list(): Promise<CredentialSummary[]>;
  save(credential: Credential): Promise<CredentialSummary>;
  delete(id: string): Promise<void>;
  // Server-only: returns secrets. Never hand the result to the API layer.
  get(id: string): Promise<Credential | null>;
  // Rewrites the same file with a new model list. Null when `id` is unknown
  // or the connection type has no models.
  setModels(id: string, models: CredentialModel[]): Promise<CredentialSummary | null>;
};

function summaryOf(id: string, credential: Credential): CredentialSummary {
  return { id, type: credential.type, method: credential.method, label: labelOf(credential) };
}

export function createCredentialStore(dir: string): CredentialStore {
  async function ensureDir() {
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
  }

  async function read(id: string): Promise<Credential | null> {
    const fileName = `${id}.json`;
    if (fileName !== path.basename(fileName)) return null;
    await ensureDir();
    try {
      return parse(await readFile(path.join(dir, fileName), "utf8"), fileName);
    } catch {
      return null;
    }
  }

  async function write(fileName: string, credential: Credential) {
    await writeFile(path.join(dir, fileName), `${JSON.stringify(credential, null, 2)}\n`, {
      mode: FILE_MODE,
    });
  }

  return {
    async list() {
      await ensureDir();
      const entries = await readdir(dir);
      const summaries: CredentialSummary[] = [];
      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await readFile(path.join(dir, entry), "utf8");
        const credential = parse(raw, entry);
        if (!credential) continue;
        summaries.push(summaryOf(entry.slice(0, -".json".length), credential));
      }
      return summaries.sort((a, b) => a.id.localeCompare(b.id));
    },

    async save(input) {
      await ensureDir();
      const credential = normalize(input);
      const fileName = fileNameFor(credential);
      await write(fileName, credential);
      return summaryOf(fileName.slice(0, -".json".length), credential);
    },

    async delete(id) {
      await ensureDir();
      const fileName = `${id}.json`;
      if (fileName !== path.basename(fileName)) return;
      await rm(path.join(dir, fileName), { force: true });
    },

    get: read,

    async setModels(id, models) {
      const credential = await read(id);
      if (!credential || (credential.type !== "openrouter" && credential.type !== "custom")) {
        return null;
      }
      await write(`${id}.json`, { ...credential, models: parseModels(models) });
      return summaryOf(id, credential);
    },
  };
}
