import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import type { Queue } from "bullmq";

export const THREAD_TITLE_QUEUE = "thread-title";
export const MAX_TITLE_LENGTH = 30;

export type ThreadTitleJob = { threadId: string };

export type ThreadTitleQueue = Pick<Queue<ThreadTitleJob>, "add">;

// jobId is the thread id, so a thread is only ever queued once.
export function enqueueThreadTitle(queue: ThreadTitleQueue, threadId: string) {
  return queue.add(
    "title",
    { threadId },
    {
      jobId: threadId,
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: true,
    },
  );
}

export type TitleSource = {
  userText: string;
  assistant: { spec: string | null; text: string; connectionId: string; modelId: string };
};

export type ThreadTitleDeps = {
  loadSource(threadId: string): Promise<TitleSource | null>;
  generate(model: { connectionId: string; modelId: string }, prompt: string): Promise<string>;
  saveTitle(threadId: string, title: string, titledAt: Date): Promise<void>;
};

// Finds the Answer element in a json-render spec and returns its text.
// Tolerant: any parse or shape problem yields "".
export function answerTextOf(specJson: string | null): string {
  if (!specJson) return "";
  let spec: unknown;
  try {
    spec = JSON.parse(specJson);
  } catch {
    return "";
  }
  const elements = (spec as { elements?: unknown })?.elements;
  if (!elements || typeof elements !== "object") return "";
  for (const element of Object.values(elements as Record<string, unknown>)) {
    const el = element as { type?: unknown; props?: Record<string, unknown> } | null;
    if (el?.type !== "Answer" || !el.props) continue;
    const lead = el.props.lead;
    if (typeof lead === "string" && lead.trim()) return lead.trim();
  }
  return "";
}

export function cleanTitle(raw: string): string {
  let title = raw.trim().split("\n")[0]?.trim() ?? "";
  title = title.replace(/^(title|标题)\s*[:：]\s*/i, "");
  title = title.replace(/^["'“”‘’「」『』`]+|["'“”‘’「」『』`]+$/g, "").trim();
  title = title.replace(/[.。…!！\s]+$/u, "");
  const chars = Array.from(title);
  if (chars.length > MAX_TITLE_LENGTH) {
    title = chars.slice(0, MAX_TITLE_LENGTH).join("").trim();
  }
  return title.replace(/[.。\s]+$/u, "");
}

export function titlePrompt(userText: string, answer: string): string {
  return [
    `Write a short title for this conversation. Rules: use the same language as the user, at most ${MAX_TITLE_LENGTH} characters, no quotes, no trailing period. Reply with the title only.`,
    "",
    `User: ${userText.slice(0, 1_000)}`,
    answer ? `Assistant: ${answer.slice(0, 1_000)}` : "",
  ]
    .filter((line, i, all) => line || i < all.length - 1)
    .join("\n");
}

// Throws on failure so BullMQ retries; after the last attempt the truncated
// title that threads.create wrote stays.
export async function generateThreadTitle(deps: ThreadTitleDeps, threadId: string) {
  const source = await deps.loadSource(threadId);
  if (!source) return null;
  const { assistant } = source;
  const answer = answerTextOf(assistant.spec) || assistant.text.trim();
  const raw = await deps.generate(
    { connectionId: assistant.connectionId, modelId: assistant.modelId },
    titlePrompt(source.userText, answer),
  );
  const title = cleanTitle(raw);
  if (!title) throw new Error("Model returned an empty title");
  await deps.saveTitle(threadId, title, new Date());
  return title;
}

export function createProxyGenerate(env: {
  proxyUrl: string;
  apiKey: string;
}): ThreadTitleDeps["generate"] {
  const provider = createOpenAI({ baseURL: `${env.proxyUrl}/v1`, apiKey: env.apiKey });
  return async ({ connectionId, modelId }, prompt) => {
    const { text } = await generateText({
      model: provider.chat(`${connectionId}/${modelId}`),
      prompt,
    });
    return text;
  };
}
