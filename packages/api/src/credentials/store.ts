import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const providerSlugs = ["claude", "openai", "gemini", "openrouter", "custom"] as const;

export type ProviderSlug = (typeof providerSlugs)[number];

export type CredentialMethod = "oauth" | "api_key";

// One file per connection. See docs/credentials.md. The file is the only
// record of a connection, so nothing here is copied into the database.
export type Credential = {
  type: ProviderSlug;
  method: CredentialMethod;
  email: string;
  account_id: string;
  api_key: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
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
  return credential.email.trim() || credential.account_id.trim() || credential.type;
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
  return {
    type: record.type,
    method: record.method,
    email: typeof record.email === "string" ? record.email : "",
    account_id: typeof record.account_id === "string" ? record.account_id : "",
    api_key: typeof record.api_key === "string" ? record.api_key : "",
    access_token: typeof record.access_token === "string" ? record.access_token : "",
    refresh_token: typeof record.refresh_token === "string" ? record.refresh_token : "",
    expires_at: typeof record.expires_at === "string" ? record.expires_at : "",
  };
}

export type CredentialStore = {
  list(): Promise<CredentialSummary[]>;
  save(credential: Credential): Promise<CredentialSummary>;
  delete(id: string): Promise<void>;
};

export function createCredentialStore(dir: string): CredentialStore {
  async function ensureDir() {
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
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
        summaries.push({
          id: entry.slice(0, -".json".length),
          type: credential.type,
          method: credential.method,
          label: labelOf(credential),
        });
      }
      return summaries.sort((a, b) => a.id.localeCompare(b.id));
    },

    async save(credential) {
      await ensureDir();
      const fileName = fileNameFor(credential);
      await writeFile(path.join(dir, fileName), `${JSON.stringify(credential, null, 2)}\n`, {
        mode: FILE_MODE,
      });
      return {
        id: fileName.slice(0, -".json".length),
        type: credential.type,
        method: credential.method,
        label: labelOf(credential),
      };
    },

    async delete(id) {
      await ensureDir();
      const fileName = `${id}.json`;
      if (fileName !== path.basename(fileName)) return;
      await rm(path.join(dir, fileName), { force: true });
    },
  };
}
