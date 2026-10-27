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

type Log = (line: string) => void;

/**
 * Starts CLIProxyAPI, or returns the one this process already runs for the
 * same data directory. Every launch renders `<dataDir>/config.yaml` from the
 * credentials (it is generated output), and after each one the credentials
 * directory is watched and pushed to CLIProxyAPI. A CLIProxyAPI that exits on
 * its own, or fails to start, is started again a second later, on the same
 * handle and port.
 */
export async function startProxy(
  settings: ProxySettings,
  onLog: Log = console.log,
): Promise<CpaServer> {
  const authDir = path.join(settings.dataDir, "auths");
  return startServer({
    stateDir: settings.dataDir,
    singleton: true,
    config: async () =>
      configOf(await loadConnections(settings.credentialsDir), { ...settings, authDir }),
    host: settings.host,
    port: settings.port,
    restart: { onUnexpectedExit: true, onStartFailure: true, backoffMs: [1000] },
    redact: [settings.accessKey],
    suppressWarnings: { noManagementKey: true },
    onLog: ({ line }) => onLog(line),
    on: {
      exit: ({ code, signal, willRestart }) => {
        if (willRestart)
          console.error("proxy: CLIProxyAPI exited, starting it again", { code, signal });
      },
      "restart-failed": ({ error }) => console.error("proxy: start failed, trying again", error),
    },
    hooks: {
      // Runs for each CLIProxyAPI process; cpajs calls the returned cleanup
      // when that process exits.
      async afterStart({ server, client, reason }) {
        if (reason === "start") console.log(`proxy: listening on port ${server.port}`);
        const syncer = createSyncer(client, settings.credentialsDir);
        await syncer.sync();
        return syncer.watch();
      },
    },
  });
}
