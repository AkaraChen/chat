// The model proxy runs inside this server. See packages/api/src/proxy/server.ts.
import path from "node:path";

import type { CpaServer } from "@cpajs/cpa/server";
import { startProxy } from "@my-better-t-app/api/proxy/server";

import { ENV } from "./env.server";

/** Starts the proxy, or returns the one already running in this process. */
export function ensureProxy(): Promise<CpaServer> {
  return startProxy({
    credentialsDir: path.resolve(ENV.CREDENTIALS_DIR),
    dataDir: path.resolve(ENV.PROXY_DATA_DIR),
    host: ENV.PROXY_HOST || "127.0.0.1",
    port: Number(new URL(ENV.PROXY_URL).port || 80),
    accessKey: ENV.PROXY_API_KEY,
  }).catch((error) => {
    // cpajs retries a start that fails, so this is what it cannot recover
    // from (no binary, bad options). Without the proxy no model call can
    // work: fail loudly and let start.sh, then Docker, restart the server.
    console.error("proxy: failed to start", error);
    process.exit(1);
  });
}
