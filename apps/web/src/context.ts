import type { Context as ApiContext } from "@my-better-t-app/api/context";
import { createCredentialStore } from "@my-better-t-app/api/credentials/store";
import { toRole } from "@my-better-t-app/db/auth";

import { auth } from "./auth";
import { ENV } from "./env.server";
import { db } from "./services";

const credentials = createCredentialStore(ENV.CREDENTIALS_DIR);

export async function createContext({ req }: { req: Request }): Promise<ApiContext> {
  const result = await auth.api.getSession({ headers: req.headers });
  return {
    db,
    credentials,
    session: result ? { role: toRole(result.user.role) } : null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
