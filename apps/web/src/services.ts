import { createPrismaClient } from "@my-better-t-app/db";

import { ENV } from "./env.server";

export const db = createPrismaClient(ENV);
