import { createAuth } from "@my-better-t-app/db/auth";

import { ENV } from "./env.server";
import { db } from "./services";

const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = process.env;

export const auth = createAuth({
  db,
  secret: ENV.BETTER_AUTH_SECRET,
  github:
    GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET
      ? { clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET }
      : undefined,
});
