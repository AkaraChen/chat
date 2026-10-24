import type { RouterClient } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import type { UIMessageChunk } from "ai";
import { z } from "zod";

import { sendChat, ThreadNotFoundError } from "../chat/run";
import {
  fileNameFor,
  providerSlugs,
  type Credential,
  type CredentialModel,
} from "../credentials/store";
import { memberProcedure, publicProcedure } from "../index";
import { listConnectionModels } from "../models/proxy";

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

const TITLE_LENGTH = 40;

// The first message, on one line, cut to fit the sidebar.
export function truncateTitle(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  const chars = Array.from(line);
  return chars.length > TITLE_LENGTH ? `${chars.slice(0, TITLE_LENGTH).join("").trimEnd()}…` : line;
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function* iterate<T>(stream: ReadableStream<T>): AsyncGenerator<T, void, unknown> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

const modelRef = z.object({
  connectionId: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
});

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),

  connections: {
    list: memberProcedure.output(z.array(summarySchema)).handler(async ({ context }) => {
      return context.credentials.list();
    }),

    // Browser sign-in is not here. It needs the provider's OAuth flow, which
    // is a separate piece of work. An API key is the whole connection.
    // Custom also names a models.dev provider; its `api` is the base URL.
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
        if (input.type === "custom" || input.type === "openrouter") {
          // Saving writes the whole file; keep the models already added.
          const existing = await context.credentials.get(fileNameFor(credential).slice(0, -5));
          credential.models = existing?.models ?? [];
        }
        return context.credentials.save(credential);
      }),

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
      const connections = await listModels(context);
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

    // Adds a models.dev model to an OpenRouter or Custom connection.
    create: memberProcedure.input(modelRef).handler(async ({ context, input }) => {
      const credential = await modelConnection(context, input.connectionId);
      const catalog = await modelsDevCatalog(context);
      const entry =
        credential.type === "openrouter"
          ? catalog.openrouter
          : catalog.custom.find((e) => e.id === credential.provider);
      const model = entry?.models.find((m) => m.id === input.modelId);
      if (!model) {
        throw new ORPCError("BAD_REQUEST", { message: "models.dev does not offer that model." });
      }
      const models = credential.models ?? [];
      if (!models.some((m) => m.name === model.id)) {
        models.push({ name: model.id, alias: model.id, display_name: model.name });
      }
      await context.credentials.setModels(input.connectionId, models);
      return models satisfies CredentialModel[];
    }),

    delete: memberProcedure.input(modelRef).handler(async ({ context, input }) => {
      const credential = await modelConnection(context, input.connectionId);
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

    get: memberProcedure
      .input(z.object({ id: z.string().min(1) }))
      .handler(async ({ context, input }) => {
        const thread = await context.db.thread.findFirst({
          where: { id: input.id, userId: context.session.userId },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        });
        if (!thread) throw new ORPCError("NOT_FOUND");
        const { messages, ...rest } = thread;
        return {
          ...rest,
          messages: messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            text: m.text,
            spec: parseJson(m.spec),
            steps: (parseJson(m.steps) ?? []) as {
              tool: string;
              status: "running" | "done" | "error";
              detail: Record<string, unknown>;
            }[],
            connectionId: m.connectionId,
            modelId: m.modelId,
            createdAt: m.createdAt,
          })),
        };
      }),

    // Starts a thread titled with the first message. The message itself is
    // sent with chat.send.
    create: memberProcedure
      .input(z.object({ text: z.string().trim().min(1) }))
      .handler(async ({ context, input }) => {
        return context.db.thread.create({
          data: { userId: context.session.userId, title: truncateTitle(input.text) },
          select: { id: true, title: true, titledAt: true, createdAt: true, updatedAt: true },
        });
      }),
  },

  chat: {
    // Yields AI SDK UI message chunks. See packages/api/src/chat/run.ts.
    send: memberProcedure
      .input(z.object({ threadId: z.string().min(1), text: z.string().trim().min(1).max(20_000) }))
      .handler(
        async ({ context, input }): Promise<AsyncGenerator<UIMessageChunk, void, unknown>> => {
          const choice = await context.db.modelChoice.findUnique({
            where: { userId: context.session.userId },
          });
          if (!choice) throw new ORPCError("BAD_REQUEST", { message: "Choose a model first." });
          const connections = await context.credentials.list();
          if (!connections.some((c) => c.id === choice.connectionId)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "The chosen model's connection was removed. Choose another model.",
            });
          }
          try {
            const stream = await sendChat(
              {
                db: context.db,
                github: context.github,
                createModel: context.createModel,
                titleQueue: context.titleQueue,
                fetch: context.fetch,
              },
              {
                userId: context.session.userId,
                threadId: input.threadId,
                text: input.text,
                connectionId: choice.connectionId,
                modelId: choice.modelId,
              },
            );
            return iterate(stream);
          } catch (error) {
            if (error instanceof ThreadNotFoundError) throw new ORPCError("NOT_FOUND");
            throw error;
          }
        },
      ),
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

// Only OpenRouter and Custom keep a model list; the others come from the proxy.
async function modelConnection(context: Ctx, connectionId: string) {
  const credential = await context.credentials.get(connectionId);
  if (!credential) throw new ORPCError("NOT_FOUND");
  if (credential.type !== "openrouter" && credential.type !== "custom") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Models can only be added to OpenRouter and Custom connections.",
    });
  }
  return credential;
}

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
