import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, username } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { createPrismaClient, type Database } from "./index";

export const roles = ["admin", "user", "visitor"] as const;
export type Role = (typeof roles)[number];

// Anything the admin plugin hasn't recognised is treated as the least access.
export function toRole(value: string | null | undefined): Role {
  return value === "admin" || value === "user" ? value : "visitor";
}

export type AuthConfig = {
  db: Database;
  secret: string;
  github?: { clientId: string; clientSecret: string };
};

// The account the design calls "account" is a username plus a password, set up
// on the web and reused by the phone. GitHub is the other way in, once it has
// credentials. Both live in the same database as everything else.
export function createAuth({ db, secret, github }: AuthConfig) {
  return betterAuth({
    database: prismaAdapter(db, { provider: "sqlite" }),
    secret,
    emailAndPassword: { enabled: true },
    databaseHooks: {
      user: {
        create: {
          // Whoever arrives first owns the instance. Everyone after them is a
          // visitor until an admin raises them.
          before: async () => {
            const existing = await db.user.count();
            return { data: { role: existing === 0 ? "admin" : "visitor" } };
          },
        },
      },
    },
    socialProviders: github ? { github } : {},
    plugins: [
      username(),
      admin({ defaultRole: "visitor", adminRoles: ["admin"] }),
      tanstackStartCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

// Only the schema generator reads this. The app builds its own instance from
// its environment instead of importing one with a secret baked in.
export const auth = createAuth({
  db: createPrismaClient({ DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db" }),
  secret: process.env.BETTER_AUTH_SECRET ?? "schema-generation-only",
});
