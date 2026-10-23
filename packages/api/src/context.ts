import type { Database } from "@my-better-t-app/db";

import type { CredentialStore } from "./credentials/store";

export type Context = {
  db: Database;
  credentials: CredentialStore;
};
