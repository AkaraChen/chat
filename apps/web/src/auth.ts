import { createAuth } from "@my-better-t-app/db/auth";

import { ENV } from "./env.server";

export const auth = createAuth(ENV);
