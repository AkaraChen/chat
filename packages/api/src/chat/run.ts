import { pipeJsonRender } from "@json-render/core";
import type { Database } from "@my-better-t-app/db";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  safeValidateUIMessages,
  streamText,
  toolSearch,
  toUIMessageStream,
  type InferUIMessageChunk,
  type ToolSet,
} from "ai";

import type { GithubStore } from "../github/store";
import { githubTools, githubToolsFor } from "../github/tools";
import { enqueueThreadTitle, type ThreadTitleQueue } from "../jobs/thread-title";
import { createSearchTemplatesTool } from "../templates/search";
import type { WebConnect } from "../web/mcp";
import { webTools, webToolSchemas } from "../web/tools";
import { coalesceTextDeltas } from "./coalesce";
import { forModel } from "./history";
import { paceText } from "./pace";
import { timePrompt, timeTool } from "./time";
import {
  dataSchemas,
  metadataSchema,
  withoutInvalidSpec,
  type ChatMessage,
  type ChatMetadata,
} from "./message";
import type { ModelFactory } from "./model";

export const MAX_STEPS = 20;
export const MAX_MESSAGE_CHARS = 20_000;

export type ChatDeps = {
  db: Database;
  github: GithubStore;
  createModel: ModelFactory;
  titleQueue: () => ThreadTitleQueue;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  /** Reaches the web search and fetch MCP server. Without it, a turn has no web tools. */
  web?: WebConnect;
};

export type ChatInput = {
  userId: string;
  threadId: string;
  /** The new user message, as `useChat` sent it. Validated here. */
  message: unknown;
  connectionId: string;
  modelId: string;
};

export class ThreadNotFoundError extends Error {
  constructor() {
    super("Thread not found");
  }
}

export class InvalidMessageError extends Error {}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The tools a turn starts with. The GitHub tools are deferred: the model
 * sees `tool_search`, `search_templates`, `get_current_time` and the web
 * tools, and a search
 * loads the GitHub tools for the next step and the rest of the turn.
 */
function toolsFor(
  token: string | null,
  fetchImpl: ChatDeps["fetch"],
  web: ReturnType<typeof webTools> | null,
): ToolSet {
  return {
    tool_search: toolSearch(),
    search_templates: createSearchTemplatesTool({ github: token !== null }),
    get_current_time: timeTool(),
    ...web?.tools,
    ...githubToolsFor(token, fetchImpl),
  } as ToolSet;
}

// History can hold GitHub and web tool calls from when they were set up, so
// every tool's schema is checked whether or not it is there now.
const historyTools = {
  tool_search: toolSearch(),
  search_templates: createSearchTemplatesTool(),
  get_current_time: timeTool(),
  ...webToolSchemas,
  ...githubTools({ token: "" }),
} as ToolSet;

type Row = { id: string; role: string; parts: string; metadata: string | null };

function fromRow(row: Row): unknown {
  return {
    id: row.id,
    role: row.role,
    parts: JSON.parse(row.parts),
    ...(row.metadata ? { metadata: JSON.parse(row.metadata) } : {}),
  };
}

/** The thread's stored messages, oldest first, unvalidated. */
export async function loadMessages(db: Database, threadId: string): Promise<unknown[]> {
  const rows = await db.message.findMany({ where: { threadId }, orderBy: { createdAt: "asc" } });
  return rows.map(fromRow);
}

async function saveMessage(db: Database, threadId: string, message: ChatMessage) {
  const parts = JSON.stringify(message.parts);
  const metadata = message.metadata ? JSON.stringify(message.metadata) : null;
  await db.message.upsert({
    where: { id: message.id },
    create: { id: message.id, threadId, role: message.role, parts, metadata },
    update: { parts, metadata },
  });
}

// A user message is text the person typed. Anything else from the client
// (tool results, data parts, another role) is not taken on trust.
function checkUserMessage(message: ChatMessage | undefined): ChatMessage {
  if (!message || message.role !== "user") {
    throw new InvalidMessageError("The last message must be the user's.");
  }
  if (!message.parts.every((part) => part.type === "text")) {
    throw new InvalidMessageError("A message can only hold text.");
  }
  const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
  if (!text.trim()) throw new InvalidMessageError("The message is empty.");
  if (text.length > MAX_MESSAGE_CHARS) throw new InvalidMessageError("The message is too long.");
  return { id: message.id, role: "user", parts: message.parts };
}

/**
 * Runs one assistant turn and returns the HTTP response: an AI SDK UI message
 * stream. Checks the thread is the user's, saves the user's message, then lets
 * the model call tools and write until it ends with text or reaches
 * MAX_STEPS. Throws before streaming when the thread is not the user's or
 * the message is invalid.
 *
 * Text that parses as JSON Patch inside a ```spec fence becomes `data-spec`
 * parts (json-render inline mode). When the stream ends, the assistant
 * message is saved as sent, minus a view that does not pass the catalog.
 * A model failure ends the stream with an `error` chunk.
 */
export async function streamChat(deps: ChatDeps, input: ChatInput): Promise<Response> {
  const { db } = deps;
  const thread = await db.thread.findFirst({
    where: { id: input.threadId, userId: input.userId },
    select: { id: true, createdAt: true },
  });
  if (!thread) throw new ThreadNotFoundError();
  const threadId = thread.id;

  const stored = await loadMessages(db, threadId);
  const validated = await safeValidateUIMessages<ChatMessage>({
    messages: [...stored, input.message],
    tools: historyTools as never,
    dataSchemas,
    metadataSchema,
  });
  if (!validated.success) throw new InvalidMessageError(validated.error.message);
  const messages = validated.data;
  const message = checkUserMessage(messages.at(-1));
  messages[messages.length - 1] = message;

  // Message ids come from the client. One that names a message in another
  // thread must not overwrite it.
  const clash = await db.message.findUnique({
    where: { id: message.id },
    select: { threadId: true },
  });
  if (clash && clash.threadId !== threadId) throw new InvalidMessageError("Message id in use.");
  await saveMessage(db, threadId, message);

  const token = await deps.github.read();
  const web = deps.web ? webTools(deps.web) : null;
  const tools = toolsFor(token, deps.fetch, web);
  const model = deps.createModel(input.connectionId, input.modelId);
  const metadata: ChatMetadata = { connectionId: input.connectionId, modelId: input.modelId };
  const modelMessages = await convertToModelMessages(forModel(messages), {
    tools,
    ignoreIncompleteToolCalls: true,
  });

  const stream = createUIMessageStream<ChatMessage>({
    originalMessages: messages,
    onError: messageOf,
    execute({ writer }) {
      const result = streamText({
        model,
        system: timePrompt(thread.createdAt),
        messages: modelMessages,
        tools,
        stopWhen: isStepCount(MAX_STEPS),
        // The last step can only write, so the turn never stops on a tool
        // call whose result the model would not see.
        prepareStep: ({ stepNumber }) =>
          stepNumber === MAX_STEPS - 1 ? { toolChoice: "none" } : undefined,
        // Large deltas arrive in blocks from some providers; spread them out.
        experimental_transform: paceText(),
        onError: () => {},
      });
      const chunks = toUIMessageStream({
        stream: result.stream,
        messageMetadata: ({ part }) => (part.type === "start" ? metadata : undefined),
        onError: messageOf,
      }) as ReadableStream<InferUIMessageChunk<ChatMessage>>;
      writer.merge(pipeJsonRender(chunks).pipeThrough(coalesceTextDeltas()));
    },
    async onEnd({ responseMessage }) {
      void web?.close();
      try {
        await finish(responseMessage);
      } catch (error) {
        console.error("answer was not saved:", messageOf(error));
      }
    },
  });

  // The SSE copy is read to the end here, so the turn finishes and is saved
  // even when the browser leaves.
  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: async ({ stream: copy }) => {
      const reader = copy.getReader();
      while (!(await reader.read()).done) {}
    },
  });

  async function finish(response: ChatMessage) {
    const answer = withoutInvalidSpec({ ...response, metadata });
    if (!answer.parts.some((part) => part.type !== "step-start")) return;
    await saveMessage(db, threadId, answer);
    await db.thread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });

    const answers = await db.message.count({
      where: { threadId: threadId, role: "assistant" },
    });
    if (answers === 1) {
      // Not awaited: the stream closes when this returns, and the reader
      // should not wait on Redis. A title is nice to have; Redis being slow or
      // down must not hold up or fail the answer.
      void Promise.resolve()
        .then(() => enqueueThreadTitle(deps.titleQueue(), threadId))
        .catch((error) => console.error("thread title was not queued:", messageOf(error)));
    }
  }
}
