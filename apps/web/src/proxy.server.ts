// The model proxy runs inside this server. See packages/api/src/proxy/server.ts.
import path from "node:path";

import { type Proxy, supervise } from "@my-better-t-app/api/proxy/server";

import { ENV } from "./env.server";

// Module code can be evaluated more than once in one process (a dev reload,
// or the Nitro plugin and the app each importing this), so the proxy lives on
// globalThis and is started once.
const holder = globalThis as { __chatProxy?: Promise<Proxy> };

export function ensureProxy(): Promise<Proxy> {
  holder.__chatProxy ??= supervise({
    credentialsDir: path.resolve(ENV.CREDENTIALS_DIR),
    dataDir: path.resolve(ENV.PROXY_DATA_DIR),
    host: ENV.PROXY_HOST || "127.0.0.1",
    port: Number(new URL(ENV.PROXY_URL).port || 80),
    accessKey: ENV.PROXY_API_KEY,
  }).then(
    (proxy) => {
      console.log(`proxy: listening on port ${proxy.server.port}`);
      return proxy;
    },
    (error) => {
      // Without the proxy no model call can work. Fail loudly and let the
      // supervisor (start.sh, then Docker) restart the whole server.
      console.error("proxy: failed to start", error);
      process.exit(1);
    },
  );
  return holder.__chatProxy;
}
