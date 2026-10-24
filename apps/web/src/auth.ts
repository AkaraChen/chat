import { createAuth } from "@my-better-t-app/db/auth";

import { ENV } from "./env.server";
import { db } from "./services";

export const auth = createAuth({
  db,
  secret: ENV.BETTER_AUTH_SECRET,
  github: { clientId: ENV.GITHUB_CLIENT_ID, clientSecret: ENV.GITHUB_CLIENT_SECRET },
});
