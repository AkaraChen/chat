import type { Context as ApiContext } from "@my-better-t-app/api/context";
import { createCredentialStore } from "@my-better-t-app/api/credentials/store";

import { ENV } from "./env.server";
import { db } from "./services";

const credentials = createCredentialStore(ENV.CREDENTIALS_DIR);

export async function createContext(_options: { req: Request }): Promise<ApiContext> {
  return {
    db,
    credentials,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
