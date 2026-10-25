import {
  createProxyGenerate,
  generateThreadTitle,
  textOfParts,
  THREAD_TITLE_QUEUE,
  type ThreadTitleDeps,
  type ThreadTitleJob,
} from "@my-better-t-app/api/jobs/thread-title";
import { createRedisConnection } from "@my-better-t-app/api/jobs/queue";
import { createPrismaClient } from "@my-better-t-app/db";
import { Worker } from "bullmq";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const db = createPrismaClient({ DATABASE_URL: required("DATABASE_URL") });

const deps: ThreadTitleDeps = {
  async loadSource(threadId) {
    const messages = await db.message.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });
    const user = messages.find((m) => m.role === "user");
    const assistant = messages.find((m) => m.role === "assistant");
    if (!user || !assistant?.metadata) return null;
    const model = JSON.parse(assistant.metadata) as { connectionId?: string; modelId?: string };
    if (!model.connectionId || !model.modelId) return null;
    return {
      userText: textOfParts(user.parts),
      assistant: {
        text: textOfParts(assistant.parts),
        connectionId: model.connectionId,
        modelId: model.modelId,
      },
    };
  },
  generate: createProxyGenerate({
    proxyUrl: required("PROXY_URL"),
    apiKey: required("PROXY_API_KEY"),
  }),
  async saveTitle(threadId, title, titledAt) {
    // Rename sets titledAt first. Do not replace a title the user chose.
    await db.thread.updateMany({
      where: { id: threadId, titledAt: null },
      data: { title, titledAt },
    });
  },
};

const worker = new Worker<ThreadTitleJob>(
  THREAD_TITLE_QUEUE,
  (job) => generateThreadTitle(deps, job.data.threadId),
  { connection: createRedisConnection(required("REDIS_URL")) },
);

worker.on("failed", (job, error) => {
  console.error(`thread-title ${job?.id} failed (attempt ${job?.attemptsMade}):`, error.message);
});
worker.on("error", (error) => console.error("worker error:", error.message));

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await worker.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log(`worker listening on ${THREAD_TITLE_QUEUE}`);
