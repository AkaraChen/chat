import { createHash } from "node:crypto";

import type { CpaClient } from "@cpajs/cpa/client";

import { type Connection, isSignIn } from "./config";

// A ChatGPT sign-in reaches CLIProxyAPI as a Codex auth file, not as a config
// group. CLIProxyAPI refreshes the tokens and rewrites that file itself, so
// the file is uploaded once from the credential and then left to it: cpajs
// tracks the file by owner and revision, and the revision is the sign-in (a
// hash of its first refresh token), so only a new sign-in replaces the file.
const OWNER = "chat";
const AUTH_FILE_PREFIX = "chat-";
// What files written before cpajs tracked them carry instead of a revision.
const LEGACY_SEED_KEY = "chat_seed";

export function authFileName(connectionId: string): string {
  return `${AUTH_FILE_PREFIX}${connectionId}.json`;
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
  };
}

const adopted = new WeakSet<CpaClient>();

/**
 * Hands files from before cpajs tracked them to cpajs, keeping the tokens
 * CLIProxyAPI has refreshed since. Their `chat_seed` is the revision a
 * reconcile would compare, so a current one is left alone instead of being
 * overwritten with the credential's stale tokens. Once per client.
 */
async function adoptLegacy(client: CpaClient): Promise<void> {
  if (adopted.has(client)) return;
  const { files } = await client.credentials.list();
  for (const { name } of files) {
    if (!name.startsWith(AUTH_FILE_PREFIX) || !name.endsWith(".json")) continue;
    const body = JSON.parse(await (await client.credentials.download(name)).text());
    if (body["x-cpajs"] || typeof body[LEGACY_SEED_KEY] !== "string") continue;
    const { [LEGACY_SEED_KEY]: seed, ...rest } = body;
    await client.credentials.upload({
      name,
      content: JSON.stringify({ ...rest, "x-cpajs": { owner: OWNER, revision: seed } }, null, 2),
    });
  }
  adopted.add(client);
}

/** Brings CLIProxyAPI's auth files in line with the sign-ins. Reports whether it changed any. */
export async function syncAuths(
  client: CpaClient,
  connections: Connection[],
  now = new Date(),
): Promise<boolean> {
  await adoptLegacy(client);
  const { uploaded, deleted } = await client.credentials.reconcile({
    owner: OWNER,
    files: connections.filter(isSignIn).map((connection) => ({
      name: authFileName(connection.id),
      content: codexAuth(connection, now),
      revision: seedOf(connection),
    })),
  });
  return uploaded.length + deleted.length > 0;
}
