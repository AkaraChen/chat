// Runs CLIProxyAPI through cpajs and keeps it configured from the credential
// files. See docs/credentials.md. The web server starts it; everything else
// reaches it over HTTP on a fixed port.
import "@cpajs/cpa/binary";
import path from "node:path";

import { type CpaServer, startServer } from "@cpajs/cpa/server";

import { configOf } from "./config";
import { createSyncer, loadConnections } from "./sync";

export type ProxySettings = {
  credentialsDir: string;
  dataDir: string;
  host: string;
  port: number;
  accessKey: string;
};

export type Proxy = { readonly server: CpaServer; stop(): Promise<void> };

type Log = (line: string) => void;

/**
 * Starts CLIProxyAPI with a config rendered from the credentials, then keeps
 * it in sync. `<dataDir>/config.yaml` is generated output and is rewritten on
 * every start; the management key is generated per start and never leaves
 * this process.
 */
export async function start(settings: ProxySettings, onLog: Log = console.log): Promise<Proxy> {
  const authDir = path.join(settings.dataDir, "auths");
  const config = configOf(await loadConnections(settings.credentialsDir), { ...settings, authDir });
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
  void server.exited.then(unwatch);
  return {
    server,
    async stop() {
      unwatch();
      await server.stop();
    },
  };
}

const RESTART_DELAY_MS = 1000;

/**
 * Like `start`, but starts CLIProxyAPI again whenever it exits on its own,
 * so a crash costs a second of model calls instead of the host process.
 */
export async function supervise(settings: ProxySettings, onLog: Log = console.log): Promise<Proxy> {
  let current = await start(settings, onLog);
  let stopped = false;

  const keepAlive = (proxy: Proxy) => {
    void proxy.server.exited.then(async (result) => {
      if (stopped) return;
      console.error("proxy: CLIProxyAPI exited, starting it again", result);
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY_MS));
        if (stopped) return;
        try {
          current = await start(settings, onLog);
          keepAlive(current);
          return;
        } catch (error) {
          console.error("proxy: restart failed", error);
        }
      }
    });
  };
  keepAlive(current);

  return {
    get server() {
      return current.server;
    },
    async stop() {
      stopped = true;
      await current.stop();
    },
  };
}
