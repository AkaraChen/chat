import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, username } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { createPrismaClient } from "./index";

export const roles = ["admin", "user", "visitor"] as const;
export type Role = (typeof roles)[number];

// The account the design calls "account" is a username plus a password, set up
// on the web and reused by the phone. GitHub is the other way in. Both live in
// the same database as everything else.
export function createAuth(env: { DATABASE_URL: string; BETTER_AUTH_SECRET: string }) {
  return betterAuth({
    database: prismaAdapter(createPrismaClient(env), { provider: "sqlite" }),
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: { enabled: true },
    user: { additionalFields: { role: { type: "string", input: false } } },
    databaseHooks: {
      user: {
        create: {
          // Whoever arrives first owns the instance. Everyone after them is a
          // visitor until an admin raises them.
          before: async () => {
            const existing = await createPrismaClient(env).user.count();
            return { data: { role: existing === 0 ? "admin" : "visitor" } };
          },
        },
      },
    },
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID ?? "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      },
    },
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
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "schema-generation-only",
});
