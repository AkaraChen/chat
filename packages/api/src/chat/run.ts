import { createSpecStreamCompiler } from "@json-render/core";
import type { Database } from "@my-better-t-app/db";
import { isStepCount, streamText, type ModelMessage, type ToolSet, type UIMessageChunk } from "ai";

import type { GithubStore } from "../github/store";
import { githubToolsFor } from "../github/tools";
import { enqueueThreadTitle, type ThreadTitleQueue } from "../jobs/thread-title";
import { validateSpec } from "../templates/catalog";
import { createSearchTemplatesTool } from "../templates/search";
import { toModelMessages } from "./history";
import type { ModelFactory } from "./model";
import { retryPrompt, systemPrompt } from "./prompt";

export const MAX_STEPS = 8;

export type Step = {
  tool: string;
  status: "running" | "done" | "error";
  detail: Record<string, unknown>;
};

export type Spec = { root: string; elements: Record<string, unknown> };

export type ChatDeps = {
  db: Database;
  github: GithubStore;
  createModel: ModelFactory;
  titleQueue: () => ThreadTitleQueue;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
};

export type SendInput = {
  userId: string;
  threadId: string;
  text: string;
  connectionId: string;
  modelId: string;
};

export class ThreadNotFoundError extends Error {
  constructor() {
    super("Thread not found");
  }
}

// What the model is told when it cannot produce a valid view twice.
export const FALLBACK_LEAD = "No view could be generated for this answer.";

export function fallbackSpec(): Spec {
  return {
    root: "answer",
    elements: {
      answer: { type: "Answer", props: { lead: FALLBACK_LEAD, source: "" }, children: [] },
    },
  };
}

export function leadOf(spec: Spec): string {
  const root = spec.elements[spec.root] as { props?: { lead?: unknown } } | undefined;
  return typeof root?.props?.lead === "string" ? root.props.lead : FALLBACK_LEAD;
}

// Joins the SpecStream text into a spec and checks it against the catalog.
export function compileAndValidate(text: string): { spec: Spec; errors: string[] } {
  const compiler = createSpecStreamCompiler<Record<string, unknown>>();
  compiler.push(text);
  compiler.push("\n");
  const spec = compiler.getResult() as Spec;
  return { spec, errors: validateSpec(spec) };
}

function detailOf(output: unknown): Record<string, unknown> {
  const detail = (output as { detail?: unknown } | null)?.detail;
  return detail && typeof detail === "object" ? (detail as Record<string, unknown>) : {};
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Starts one assistant turn. Checks the thread belongs to the user and saves the
 * user's message, then returns a UI message stream. Throws before streaming
 * when the thread is not the user's.
 *
 * Chunks, in order:
 * - `start`, then per attempt a text part holding SpecStream lines (only the
 *   final model step's text), tool parts (`tool-<id>`, output `{ detail }`),
 *   `data-spec-reset` whenever the client must drop the text it has so far,
 * - `data-spec` with the final validated (or fallback) spec, then `finish`.
 * - `error` instead of `data-spec` when the model call itself failed.
 */
export async function sendChat(
  deps: ChatDeps,
  input: SendInput,
): Promise<ReadableStream<UIMessageChunk>> {
  const { db } = deps;
  const thread = await db.thread.findFirst({
    where: { id: input.threadId, userId: input.userId },
    select: { id: true },
  });
  if (!thread) throw new ThreadNotFoundError();

  const prior = await db.message.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
  });
  await db.message.create({ data: { threadId: thread.id, role: "user", text: input.text } });

  const token = await deps.github.read();
  const tools = {
    search_templates: createSearchTemplatesTool({ github: token !== null }),
    ...githubToolsFor(token, deps.fetch),
  } as unknown as ToolSet;
  const system = systemPrompt({ github: token !== null });
  const model = deps.createModel(input.connectionId, input.modelId);
  const base: ModelMessage[] = [...toModelMessages(prior), { role: "user", content: input.text }];

  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      let open = true;
      const write = (chunk: UIMessageChunk) => {
        if (!open) return;
        try {
          controller.enqueue(chunk);
        } catch {
          open = false;
        }
      };
      // Keep going when the browser leaves: the answer is still saved.
      void run(write)
        .catch((error) => write({ type: "error", errorText: messageOf(error) }))
        .finally(() => {
          write({ type: "finish" });
          if (open) controller.close();
          open = false;
        });
    },
  });

  async function run(write: (chunk: UIMessageChunk) => void) {
    write({ type: "start" });
    const steps: Step[] = [];
    const stepByCall = new Map<string, Step>();
    let textSeq = 0;

    // One model call. Returns the text of the final step only; text from steps
    // that ended in tool calls is dropped.
    async function attempt(messages: ModelMessage[], retry: boolean) {
      const result = streamText({
        model,
        instructions: system,
        messages,
        tools,
        toolChoice: retry ? "none" : undefined,
        stopWhen: isStepCount(retry ? 1 : MAX_STEPS),
        onError: () => {},
      });
      let openText: string | null = null;
      let stepText = "";
      let stepHadTool = false;
      let finalText = "";

      const closeText = () => {
        if (openText) write({ type: "text-end", id: openText });
        openText = null;
      };

      for await (const part of result.stream) {
        switch (part.type) {
          case "start-step":
            stepText = "";
            stepHadTool = false;
            break;
          case "text-delta":
            if (stepHadTool || !part.text) break;
            if (!openText) {
              openText = `text-${++textSeq}`;
              write({ type: "text-start", id: openText });
            }
            stepText += part.text;
            write({ type: "text-delta", id: openText, delta: part.text });
            break;
          case "tool-input-start":
            write({ type: "tool-input-start", toolCallId: part.id, toolName: part.toolName });
            break;
          case "tool-call": {
            closeText();
            // The text before this call was not the answer after all.
            if (stepText) write({ type: "data-spec-reset", data: {} });
            stepText = "";
            stepHadTool = true;
            const step: Step = { tool: part.toolName, status: "running", detail: {} };
            steps.push(step);
            stepByCall.set(part.toolCallId, step);
            write({
              type: "tool-input-available",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
            });
            break;
          }
          case "tool-result": {
            const step = stepByCall.get(part.toolCallId);
            const detail = detailOf(part.output);
            if (step) {
              step.status = "done";
              step.detail = detail;
            }
            write({
              type: "tool-output-available",
              toolCallId: part.toolCallId,
              output: { detail },
            });
            break;
          }
          case "tool-error": {
            const step = stepByCall.get(part.toolCallId);
            if (step) step.status = "error";
            write({
              type: "tool-output-error",
              toolCallId: part.toolCallId,
              errorText: messageOf(part.error),
            });
            break;
          }
          case "finish-step":
            closeText();
            finalText = stepHadTool ? "" : stepText;
            break;
          case "error":
            throw part.error instanceof Error ? part.error : new Error(messageOf(part.error));
          default:
            break;
        }
      }
      closeText();
      return { text: finalText, responseMessages: await result.responseMessages };
    }

    let outcome = await attempt(base, false);
    let compiled = compileAndValidate(outcome.text);

    if (compiled.errors.length > 0) {
      write({ type: "data-spec-reset", data: {} });
      outcome = await attempt(
        [
          ...base,
          ...outcome.responseMessages,
          { role: "user", content: retryPrompt(compiled.errors) },
        ],
        true,
      );
      compiled = compileAndValidate(outcome.text);
    }

    const spec = compiled.errors.length === 0 ? compiled.spec : fallbackSpec();
    write({ type: "data-spec", data: spec });

    await db.message.create({
      data: {
        threadId: input.threadId,
        role: "assistant",
        text: leadOf(spec),
        spec: JSON.stringify(spec),
        steps: JSON.stringify(steps),
        connectionId: input.connectionId,
        modelId: input.modelId,
      },
    });
    await db.thread.update({ where: { id: input.threadId }, data: { updatedAt: new Date() } });

    const answers = await db.message.count({
      where: { threadId: input.threadId, role: "assistant" },
    });
    if (answers === 1) {
      try {
        await enqueueThreadTitle(deps.titleQueue(), input.threadId);
      } catch (error) {
        // A title is nice to have; Redis being down must not fail the answer.
        console.error("thread title was not queued:", messageOf(error));
      }
    }
  }
}
