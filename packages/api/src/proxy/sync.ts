import { watch } from "node:fs";
import { mkdir } from "node:fs/promises";

import type { CpaClient } from "@cpajs/cpa/client";
import { createCredentialStore } from "../credentials/store";

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
 * groups through the config, the sign-ins as auth files. Neither is written
 * when it already matches, since every config write is a hot reload.
 */
export function createSyncer(client: CpaClient, credentialsDir: string) {
  async function sync(): Promise<void> {
    const connections = await loadConnections(credentialsDir);
    const { changed } = await client.config.reconcile({ "api-keys": apiKeysOf(connections) });
    if (changed.length > 0) console.log(`config: wrote ${connections.length} connection(s)`);
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
