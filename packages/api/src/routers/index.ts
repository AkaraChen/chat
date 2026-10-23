import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { providerSlugs, type Credential } from "../credentials/store";
import { publicProcedure } from "../index";

const providerSchema = z.enum(providerSlugs);

const summarySchema = z.object({
  id: z.string(),
  type: providerSchema,
  method: z.enum(["oauth", "api_key"]),
  label: z.string(),
});

function blank(type: Credential["type"], apiKey: string): Credential {
  return {
    type,
    method: "api_key",
    email: "",
    account_id: "",
    api_key: apiKey,
    access_token: "",
    refresh_token: "",
    expires_at: "",
  };
}

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),

  connections: {
    list: publicProcedure.output(z.array(summarySchema)).handler(async ({ context }) => {
      return context.credentials.list();
    }),

    // Browser sign-in is not here. It needs the provider's OAuth flow, which
    // is a separate piece of work. An API key is the whole connection.
    saveApiKey: publicProcedure
      .input(z.object({ type: providerSchema, apiKey: z.string().trim().min(1) }))
      .output(summarySchema)
      .handler(async ({ context, input }) => {
        return context.credentials.save(blank(input.type, input.apiKey));
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().trim().min(1) }))
      .handler(async ({ context, input }) => {
        const known = await context.credentials.list();
        if (!known.some((connection) => connection.id === input.id)) {
          throw new ORPCError("NOT_FOUND");
        }
        await context.credentials.delete(input.id);
      }),
  },
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
