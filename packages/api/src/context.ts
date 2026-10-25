import type { Database } from "@my-better-t-app/db";
import type { Role } from "@my-better-t-app/db/auth";

import type { ModelFactory } from "./chat/model";
import type { OpenAIDeviceAuth } from "./credentials/openai-device";
import type { CredentialStore } from "./credentials/store";
import type { GithubStore } from "./github/store";
import type { ThreadTitleQueue } from "./jobs/thread-title";
import type { ModelsDev } from "./models/models-dev";

export type Context = {
  db: Database;
  credentials: CredentialStore;
  openaiDevice: OpenAIDeviceAuth;
  github: GithubStore;
  modelsDev: ModelsDev;
  // Server-only. Nothing here is ever returned to the browser.
  proxy: { url: string; apiKey: string };
  // Created on first use, so the web app starts without Redis.
  titleQueue: () => ThreadTitleQueue;
  createModel: ModelFactory;
  // Replaces `fetch` for the proxy and GitHub. Tests only.
  fetch?: typeof fetch;
  session: { userId: string; role: Role } | null;
};
