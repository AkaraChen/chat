import { watch } from "node:fs";
import { mkdir } from "node:fs/promises";

import type { CpaClient } from "@cpajs/cpa/client";
import { createCredentialStore } from "@my-better-t-app/api/credentials/store";

import { syncAuths } from "./auths";
import { type Connection, apiKeysOf } from "./config";

export async function loadConnections(credentialsDir: string): Promise<Connection[]> {
  const store = createCredentialStore(credentialsDir);
  const connections: Connection[] = [];
  for (const { id } of await store.list()) {
    const credential = await store.get(id);
    if (credential) connections.push({ id, credential });
  }
  return connections;
}

/**
 * Keeps CLIProxyAPI in line with the credentials directory: the API-key
 * groups through the config, the sign-ins as auth files. `applied` is the
 * api-keys section CLIProxyAPI already has, so an unchanged one is not
 * written again (every write is a hot reload).
 */
export function createSyncer(client: CpaClient, credentialsDir: string, applied: unknown) {
  let last = JSON.stringify(applied);

  async function sync(): Promise<void> {
    const connections = await loadConnections(credentialsDir);
    const apiKeys = apiKeysOf(connections);
    const next = JSON.stringify(apiKeys);
    if (next !== last) {
      // Arrays replace on a patch, and every section we use is always sent.
      await client.config.patch({ "api-keys": apiKeys });
      last = next;
      console.log(`config: wrote ${connections.length} connection(s)`);
    }
    if (await syncAuths(client, connections)) console.log("auths: synced sign-ins");
  }

  // One sync at a time; a change during a sync schedules one more.
  let running: Promise<void> | null = null;
  let again = false;
  function run(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = sync()
      .catch((error) => console.error("sync:", error))
      .finally(() => {
        running = null;
        if (again) {
          again = false;
          void run();
        }
      });
    return running;
  }

  /** Re-syncs whenever the directory changes. Debounced, because writers truncate then write. */
  async function watchDir(): Promise<() => void> {
    await mkdir(credentialsDir, { recursive: true, mode: 0o700 });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watcher = watch(credentialsDir, () => {
      clearTimeout(timer);
      timer = setTimeout(run, 200);
    });
    return () => {
      clearTimeout(timer);
      watcher.close();
    };
  }

  return { sync: run, watch: watchDir };
}
