// Runs CLIProxyAPI through cpajs and keeps it configured from the credential
// files that packages/api writes. See docs/credentials.md.
import path from "node:path";

import { type CpaServer, startServer } from "@cpajs/cpa/server";

import { configOf } from "./config";
import { createSyncer, loadConnections } from "./sync";

export type Settings = {
  credentialsDir: string;
  dataDir: string;
  host: string;
  port: number;
  accessKey: string;
};

export function settingsFromEnv(env = process.env): Settings {
  const port = Number.parseInt(env.PROXY_PORT || "8317", 10);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`PROXY_PORT: ${env.PROXY_PORT}`);
  const accessKey = env.PROXY_API_KEY ?? "";
  if (!accessKey) throw new Error("PROXY_API_KEY is required");
  return {
    credentialsDir: path.resolve(env.CREDENTIALS_DIR || "../../.data/credentials"),
    dataDir: path.resolve(env.PROXY_DATA_DIR || ".data/proxy"),
    host: env.PROXY_HOST || "127.0.0.1",
    port,
    accessKey,
  };
}

export type Proxy = { server: CpaServer; stop(): Promise<void> };

/**
 * Starts CLIProxyAPI with a config rendered from the credentials, then keeps
 * it in sync. `<dataDir>/config.yaml` is generated output and is rewritten on
 * every start; the management key is generated per start and never leaves
 * this process.
 */
export async function start(settings: Settings, onLog = console.log): Promise<Proxy> {
  const authDir = path.join(settings.dataDir, "auths");
  const connections = await loadConnections(settings.credentialsDir);
  const config = configOf(connections, { ...settings, authDir });
  const server = await startServer({
    stateDir: settings.dataDir,
    config,
    overwriteConfig: true,
    host: settings.host,
    port: settings.port,
    redact: [settings.accessKey],
    suppressWarnings: { noManagementKey: true },
    onLog: ({ line }) => onLog(line),
  });
  const syncer = createSyncer(server.client(), settings.credentialsDir, config["api-keys"]);
  await syncer.sync();
  const unwatch = await syncer.watch();
  return {
    server,
    async stop() {
      unwatch();
      await server.stop();
    },
  };
}

if (import.meta.main) {
  const proxy = await start(settingsFromEnv());
  console.log(`proxy: listening on ${proxy.server.origin}`);
  // CLIProxyAPI dying on its own takes this process down too, so the
  // container exits and is restarted.
  let stopping = false;
  void proxy.server.exited.then((result) => {
    if (stopping) return;
    console.error("proxy: CLIProxyAPI exited", result);
    process.exit(1);
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      stopping = true;
      void proxy.stop().finally(() => process.exit(0));
    });
  }
}
