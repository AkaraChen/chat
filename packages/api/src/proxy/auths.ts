import { createHash } from "node:crypto";

import type { CpaClient } from "@cpajs/cpa/client";

import { type Connection, isSignIn } from "./config";

// A ChatGPT sign-in reaches CLIProxyAPI as a Codex auth file, not as a config
// group. CLIProxyAPI refreshes the tokens and rewrites that file itself,
// keeping fields it does not know, so the file is uploaded once from the
// credential and then left to it. The credential's tokens are only the seed:
// `chat_seed` records which sign-in a file came from, and a new sign-in
// (another refresh token) replaces the file.
const AUTH_FILE_PREFIX = "chat-";
const SEED_KEY = "chat_seed";

export function authFileName(connectionId: string): string {
  return `${AUTH_FILE_PREFIX}${connectionId}.json`;
}

function isOurs(name: string): boolean {
  return name.startsWith(AUTH_FILE_PREFIX) && name.endsWith(".json");
}

export function seedOf({ credential }: Connection): string {
  return createHash("sha256").update(credential.refresh_token).digest("hex").slice(0, 16);
}

// The file CLIProxyAPI reads for a Codex OAuth account
// (internal/auth/codex/token.go), plus `prefix`, which it reads from any auth
// file, so the account's models are addressed `<connectionId>/<model>`.
export function codexAuth(connection: Connection, now: Date): Record<string, string> {
  const { id, credential } = connection;
  return {
    type: "codex",
    email: credential.email,
    account_id: credential.account_id,
    access_token: credential.access_token,
    refresh_token: credential.refresh_token,
    id_token: credential.id_token ?? "",
    expired: credential.expires_at,
    last_refresh: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    plan_type: credential.plan_type || "free",
    prefix: id,
    [SEED_KEY]: seedOf(connection),
  };
}

export type AuthPlan = { upload: Connection[]; remove: string[] };

/**
 * What to change, given the seeds of the `chat-` files CLIProxyAPI has
 * (undefined for one without a seed). Upload a sign-in that has no file or
 * whose file came from an earlier sign-in; remove the files of sign-ins that
 * are gone. Files without the `chat-` prefix are never touched.
 */
export function planAuths(
  existing: ReadonlyMap<string, string | undefined>,
  connections: Connection[],
): AuthPlan {
  const plan: AuthPlan = { upload: [], remove: [] };
  const want = new Set<string>();
  for (const connection of connections) {
    if (!isSignIn(connection)) continue;
    const name = authFileName(connection.id);
    want.add(name);
    if (existing.get(name) !== seedOf(connection)) plan.upload.push(connection);
  }
  for (const name of existing.keys()) {
    if (isOurs(name) && !want.has(name)) plan.remove.push(name);
  }
  return plan;
}

async function seedsOf(client: CpaClient): Promise<Map<string, string | undefined>> {
  const { files } = await client.credentials.list();
  const seeds = new Map<string, string | undefined>();
  for (const { name } of files) {
    if (!isOurs(name)) continue;
    let seed: string | undefined;
    try {
      const body = JSON.parse(await (await client.credentials.download(name)).text());
      if (typeof body?.[SEED_KEY] === "string") seed = body[SEED_KEY];
    } catch {
      // Unreadable: treat as seedless, so the sign-in is uploaded again.
    }
    seeds.set(name, seed);
  }
  return seeds;
}

/** Brings CLIProxyAPI's auth files in line with the sign-ins. Reports whether it changed any. */
export async function syncAuths(
  client: CpaClient,
  connections: Connection[],
  now = new Date(),
): Promise<boolean> {
  const plan = planAuths(await seedsOf(client), connections);
  for (const connection of plan.upload) {
    await client.credentials.upload({
      name: authFileName(connection.id),
      content: JSON.stringify(codexAuth(connection, now), null, 2),
    });
  }
  if (plan.remove.length > 0) await client.credentials.delete(plan.remove);
  return plan.upload.length + plan.remove.length > 0;
}
