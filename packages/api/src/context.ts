import type { Database } from "@my-better-t-app/db";
import type { Role } from "@my-better-t-app/db/auth";

import type { CredentialStore } from "./credentials/store";

export type Context = {
  db: Database;
  credentials: CredentialStore;
  session: { role: Role } | null;
};
