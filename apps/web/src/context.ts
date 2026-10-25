import { createProxyModelFactory } from "@my-better-t-app/api/chat/model";
import type { Context as ApiContext } from "@my-better-t-app/api/context";
import { createOpenAIDeviceAuth } from "@my-better-t-app/api/credentials/openai-device";
import { createCredentialStore } from "@my-better-t-app/api/credentials/store";
import { createGithubStore } from "@my-better-t-app/api/github/store";
import { createThreadTitleQueue } from "@my-better-t-app/api/jobs/queue";
import type { ThreadTitleQueue } from "@my-better-t-app/api/jobs/thread-title";
import { createModelsDev } from "@my-better-t-app/api/models/models-dev";
import { toRole } from "@my-better-t-app/db/auth";

import { auth } from "./auth";
import { ENV } from "./env.server";
import { db } from "./services";

const credentials = createCredentialStore(ENV.CREDENTIALS_DIR);
const openaiDevice = createOpenAIDeviceAuth();
const github = createGithubStore(ENV.GITHUB_TOKEN_FILE);
const modelsDev = createModelsDev({ cachePath: ENV.MODELS_DEV_CACHE_FILE });
const proxy = { url: ENV.PROXY_URL, apiKey: ENV.PROXY_API_KEY };
const createModel = createProxyModelFactory(proxy);

let queue: ThreadTitleQueue | undefined;
const titleQueue = () => (queue ??= createThreadTitleQueue(ENV.REDIS_URL));

export async function createContext({ req }: { req: Request }): Promise<ApiContext> {
  const result = await auth.api.getSession({ headers: req.headers });
  return {
    db,
    credentials,
    openaiDevice,
    github,
    modelsDev,
    proxy,
    titleQueue,
    createModel,
    session: result ? { userId: result.user.id, role: toRole(result.user.role) } : null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
