import { z } from "zod";

import type { Context } from "../context";
import { InvalidMessageError, streamChat, ThreadNotFoundError } from "./run";

// What `useChat` sends: the thread id and only its newest message. The
// server already holds the rest of the conversation.
const body = z.object({ id: z.string().min(1), message: z.unknown() });

// `DefaultChatTransport` shows the body of a failed response as the error.
const fail = (status: number, message: string) => new Response(message, { status });

/**
 * POST /api/chat. Same membership rule as the oRPC member procedures, then
 * one assistant turn for the user's chosen model.
 */
export async function handleChatRequest(context: Context, request: Request): Promise<Response> {
  const { session } = context;
  if (!session) return fail(401, "Sign in first.");
  if (session.role === "visitor") return fail(403, "Only members can chat.");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Send a thread id and a message.");

  const choice = await context.db.modelChoice.findUnique({ where: { userId: session.userId } });
  if (!choice) return fail(400, "Choose a model first.");
  const connections = await context.credentials.list();
  if (!connections.some((c) => c.id === choice.connectionId)) {
    return fail(400, "The chosen model's connection was removed. Choose another model.");
  }

  try {
    return await streamChat(
      {
        db: context.db,
        github: context.github,
        createModel: context.createModel,
        titleQueue: context.titleQueue,
        fetch: context.fetch,
      },
      {
        userId: session.userId,
        threadId: parsed.data.id,
        message: parsed.data.message,
        connectionId: choice.connectionId,
        modelId: choice.modelId,
      },
    );
  } catch (error) {
    if (error instanceof ThreadNotFoundError) return fail(404, "Thread not found.");
    if (error instanceof InvalidMessageError) return fail(400, error.message);
    throw error;
  }
}
