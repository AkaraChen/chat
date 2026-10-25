import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { ChatMessage } from "../chat/message";
import { loadMessages } from "../chat/run";
import { exportAccess, exportDurations } from "../export/duration";
import { ExportDenied, ExportMissing, mintThreadExport } from "../export/share";
import { DeviceAuthError } from "../credentials/openai-device";
import {
  fileNameFor,
  providerSlugs,
  type Credential,
  type CredentialModel,
} from "../credentials/store";
import { memberProcedure, publicProcedure } from "../index";
import { listConnectionModels } from "../models/proxy";
import { syncConnectionModels } from "../models/sync";

const providerSchema = z.enum(providerSlugs);

const summarySchema = z.object({
  id: z.string(),
  type: providerSchema,
  method: z.enum(["oauth", "api_key"]),
  label: z.string(),
  provider: z.string().optional(),
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

const TITLE_LENGTH = 40;

// The first message, on one line, cut to fit the sidebar.
export function truncateTitle(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(line);
  return chars.length > TITLE_LENGTH ? `${chars.slice(0, TITLE_LENGTH).join("").trimEnd()}…` : line;
}

const modelRef = z.object({
  connectionId: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
});

// Alias is what the picker shows. The model id is still what the request sends.
const modelCreate = modelRef.extend({
  displayName: z.string().trim().min(1).optional(),
});

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),

  connections: {
    list: memberProcedure.output(z.array(summarySchema)).handler(async ({ context }) => {
      return context.credentials.list();
    }),

    // An API key is the whole connection. Custom also names a models.dev
    // provider; its `api` is the base URL. The connection's models come from
    // models.dev straight away, so it can be picked as soon as it is saved.
    saveApiKey: memberProcedure
      .input(
        z.object({
          type: providerSchema,
          apiKey: z.string().trim().min(1),
          provider: z.string().trim().min(1).optional(),
        }),
      )
      .output(summarySchema)
      .handler(async ({ context, input }) => {
        const credential = blank(input.type, input.apiKey);
        if (input.type === "custom") {
          if (!input.provider) {
            throw new ORPCError("BAD_REQUEST", { message: "Choose a provider for Custom." });
          }
          const catalog = await modelsDevCatalog(context);
          const entry = catalog.custom.find((e) => e.id === input.provider);
          if (!entry) {
            throw new ORPCError("BAD_REQUEST", { message: "Unknown provider." });
          }
          credential.provider = entry.id;
          credential.base_url = entry.api;
        }
        // Saving writes the whole file; keep the models it already has.
        const existing = await context.credentials.get(fileNameFor(credential).slice(0, -5));
        credential.models = existing?.models ?? [];
        const saved = await context.credentials.save(credential);
        await syncOne(context, saved.id);
        return saved;
      }),

    // ChatGPT sign-in, OpenAI only: `start` returns a code to enter at OpenAI,
    // and the browser calls `poll` until it says done. Nothing is kept here
    // between the two; the browser holds the code.
    openaiSignIn: {
      start: memberProcedure.handler(async ({ context }) =>
        deviceStep(() => context.openaiDevice.start()),
      ),
      poll: memberProcedure
        .input(z.object({ deviceAuthId: z.string().min(1), userCode: z.string().min(1) }))
        .handler(async ({ context, input }) => {
          const result = await deviceStep(() => context.openaiDevice.poll(input));
          if (result.status === "pending") return { status: "pending" as const };
          return {
            status: "done" as const,
            connection: await context.credentials.save(result.credential),
          };
        }),
    },

    delete: memberProcedure
      .input(z.object({ id: z.string().trim().min(1) }))
      .handler(async ({ context, input }) => {
        const known = await context.credentials.list();
        if (!known.some((connection) => connection.id === input.id)) {
          throw new ORPCError("NOT_FOUND");
        }
        await context.credentials.delete(input.id);
      }),
  },

  models: {
    // Models the proxy serves, by connection, and the user's choice. The choice
    // is `available: false` once its connection or model is gone.
    list: memberProcedure.handler(async ({ context }) => {
      const listed = await listModels(context);
      // A custom connection reads as its models.dev provider's name. A missing
      // catalog only costs the name.
      const catalog = await context.modelsDev.catalog().catch(() => null);
      const connections = listed.map((c) =>
        c.type === "custom"
          ? { ...c, name: catalog?.custom.find((e) => e.id === c.label)?.name ?? c.label }
          : c,
      );
      const row = await context.db.modelChoice.findUnique({
        where: { userId: context.session.userId },
      });
      const choice = row
        ? {
            connectionId: row.connectionId,
            modelId: row.modelId,
            available: connections.some(
              (c) =>
                c.connectionId === row.connectionId && c.models.some((m) => m.id === row.modelId),
            ),
          }
        : null;
      return { connections, choice };
    }),

    select: memberProcedure.input(modelRef).handler(async ({ context, input }) => {
      const connections = await listModels(context);
      const exists = connections.some(
        (c) =>
          c.connectionId === input.connectionId && c.models.some((m) => m.id === input.modelId),
      );
      if (!exists) throw new ORPCError("BAD_REQUEST", { message: "That model is not available." });
      await context.db.modelChoice.upsert({
        where: { userId: context.session.userId },
        create: { userId: context.session.userId, ...input },
        update: input,
      });
      return { ...input, available: true };
    }),

    // What the settings panel may pick from, already filtered by models.dev rules.
    catalog: memberProcedure.handler(async ({ context }) => modelsDevCatalog(context)),

    // Downloads models.dev again and syncs every connection's models now,
    // instead of waiting for the twice-daily job.
    refresh: memberProcedure.handler(async ({ context }) => {
      let catalog;
      try {
        catalog = await context.modelsDev.refresh();
      } catch {
        throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Could not reach models.dev." });
      }
      return syncConnectionModels(context.credentials, catalog);
    }),

    // Adds a model by hand, for one models.dev does not list yet. A sync
    // keeps it.
    create: memberProcedure.input(modelCreate).handler(async ({ context, input }) => {
      const credential = await modelConnection(context, input.connectionId);
      const models = credential.models ?? [];
      if (!models.some((m) => m.name === input.modelId)) {
        models.push({
          name: input.modelId,
          alias: input.modelId,
          display_name: input.displayName || input.modelId,
          manual: true,
        });
      }
      await context.credentials.setModels(input.connectionId, models);
      return models satisfies CredentialModel[];
    }),

    // Only a model added by hand can be removed; the next sync would bring a
    // models.dev one back.
    delete: memberProcedure.input(modelRef).handler(async ({ context, input }) => {
      const credential = await modelConnection(context, input.connectionId);
      const target = credential.models?.find((m) => m.name === input.modelId);
      if (target && !target.manual) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That model comes from models.dev and comes back on the next sync.",
        });
      }
      const models = (credential.models ?? []).filter((m) => m.name !== input.modelId);
      await context.credentials.setModels(input.connectionId, models);
      return models satisfies CredentialModel[];
    }),
  },

  threads: {
    list: memberProcedure.handler(async ({ context }) => {
      return context.db.thread.findMany({
        where: { userId: context.session.userId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, titledAt: true, createdAt: true, updatedAt: true },
      });
    }),

    // The thread with its messages as stored: AI SDK `UIMessage`s.
    get: memberProcedure
      .input(z.object({ id: z.string().min(1) }))
      .handler(async ({ context, input }) => {
        const thread = await context.db.thread.findFirst({
          where: { id: input.id, userId: context.session.userId },
          select: { id: true, title: true, titledAt: true, createdAt: true, updatedAt: true },
        });
        if (!thread) throw new ORPCError("NOT_FOUND");
        const messages = (await loadMessages(context.db, thread.id)) as ChatMessage[];
        return { ...thread, messages };
      }),

    // Starts a thread titled with the first message. The message itself is
    // sent to POST /api/chat.
    create: memberProcedure
      .input(z.object({ text: z.string().trim().min(1) }))
      .handler(async ({ context, input }) => {
        return context.db.thread.create({
          data: { userId: context.session.userId, title: truncateTitle(input.text) },
          select: { id: true, title: true, titledAt: true, createdAt: true, updatedAt: true },
        });
      }),

    // A manual title is final: titledAt stops the sidebar poll and the worker.
    rename: memberProcedure
      .input(z.object({ id: z.string().min(1), title: z.string().trim().min(1).max(80) }))
      .handler(async ({ context, input }) => {
        const updated = await context.db.thread.updateMany({
          where: { id: input.id, userId: context.session.userId },
          data: { title: input.title, titledAt: new Date() },
        });
        if (updated.count !== 1) throw new ORPCError("NOT_FOUND");
        const thread = await context.db.thread.findFirst({
          where: { id: input.id, userId: context.session.userId },
          select: { id: true, title: true, titledAt: true, createdAt: true, updatedAt: true },
        });
        if (!thread) throw new ORPCError("NOT_FOUND");
        return thread;
      }),

    delete: memberProcedure
      .input(z.object({ id: z.string().min(1) }))
      .handler(async ({ context, input }) => {
        const deleted = await context.db.thread.deleteMany({
          where: { id: input.id, userId: context.session.userId },
        });
        if (deleted.count !== 1) throw new ORPCError("NOT_FOUND");
        return { id: input.id };
      }),

    // A stateless link. The token is the whole record.
    export: memberProcedure
      .input(
        z.object({
          id: z.string().min(1),
          access: z.enum(exportAccess),
          duration: z.enum(exportDurations),
        }),
      )
      .handler(async ({ context, input }) => {
        try {
          const minted = await mintThreadExport({
            db: context.db,
            secret: context.authSecret,
            actor: context.session,
            threadId: input.id,
            access: input.access,
            duration: input.duration,
          });
          return {
            token: minted.token,
            access: minted.access,
            expiresAt: minted.expiresAt.toISOString(),
          };
        } catch (error) {
          if (error instanceof ExportDenied) throw new ORPCError("FORBIDDEN");
          if (error instanceof ExportMissing) throw new ORPCError("NOT_FOUND");
          throw error;
        }
      }),
  },

  github: {
    get: memberProcedure.handler(async ({ context }) => ({ set: await context.github.get() })),

    save: memberProcedure
      .input(z.object({ token: z.string().trim().min(1) }))
      .handler(async ({ context, input }) => {
        await context.github.save(input.token);
        return { set: true };
      }),

    clear: memberProcedure.handler(async ({ context }) => {
      await context.github.clear();
      return { set: false };
    }),
  },
};

type Ctx = Parameters<Parameters<typeof memberProcedure.handler>[0]>[0]["context"];

async function listModels(context: Ctx) {
  try {
    const connections = await listConnectionModels({
      proxyUrl: context.proxy.url,
      apiKey: context.proxy.apiKey,
      credentials: context.credentials,
      fetch: context.fetch,
    });
    // Same model id as the proxy uses, minus the connection prefix.
    return connections;
  } catch (error) {
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: `Could not list models: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function modelsDevCatalog(context: Ctx) {
  try {
    return await context.modelsDev.catalog();
  } catch {
    throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Could not load models.dev." });
  }
}

// A new key's models. If models.dev cannot be reached the key is still saved;
// the next sync, or a manual refresh, fills the list.
async function syncOne(context: Ctx, connectionId: string) {
  try {
    await syncConnectionModels(
      context.credentials,
      await context.modelsDev.catalog(),
      connectionId,
    );
  } catch (error) {
    console.error("models were not synced:", error instanceof Error ? error.message : error);
  }
}

// OpenAI's own errors are worth showing; anything else is ours.
async function deviceStep<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DeviceAuthError) {
      throw new ORPCError("BAD_GATEWAY", { message: error.message });
    }
    throw error;
  }
}

// An API-key connection keeps its own model list; a ChatGPT sign-in's models
// come from the proxy.
async function modelConnection(context: Ctx, connectionId: string) {
  const credential = await context.credentials.get(connectionId);
  if (!credential) throw new ORPCError("NOT_FOUND");
  if (credential.method !== "api_key") {
    throw new ORPCError("BAD_REQUEST", {
      message: "A ChatGPT sign-in gets its models from the plan.",
    });
  }
  return credential;
}

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
