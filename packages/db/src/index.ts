import { PrismaLibSql } from "@prisma/adapter-libsql";

import { PrismaClient } from "../prisma/generated/client";
import type { DatabaseConfig } from "./config";

export function createPrismaClient(env: DatabaseConfig) {
  const adapter = new PrismaLibSql({
    url: env.DATABASE_URL,
  });

  return new PrismaClient({ adapter });
}

export type Database = ReturnType<typeof createPrismaClient>;
