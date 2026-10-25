import {
  createProxyGenerate,
  generateThreadTitle,
  textOfParts,
  THREAD_TITLE_QUEUE,
  type ThreadTitleDeps,
  type ThreadTitleJob,
} from "@my-better-t-app/api/jobs/thread-title";
import {
  MODELS_SYNC_QUEUE,
  runModelsSync,
  scheduleModelsSync,
} from "@my-better-t-app/api/jobs/models-sync";
import { createModelsSyncQueue, createRedisConnection } from "@my-better-t-app/api/jobs/queue";
import { createCredentialStore } from "@my-better-t-app/api/credentials/store";
import { createModelsDev } from "@my-better-t-app/api/models/models-dev";
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

// Every connection's models, from models.dev, twice a day.
const modelsSyncDeps = {
  credentials: createCredentialStore(required("CREDENTIALS_DIR")),
  modelsDev: createModelsDev({ cachePath: required("MODELS_DEV_CACHE_FILE") }),
};
const modelsSync = new Worker(
  MODELS_SYNC_QUEUE,
  async () => {
    const results = await runModelsSync(modelsSyncDeps);
    const changed = results.filter((result) => result.changed).length;
    console.log(`models-sync: ${results.length} connection(s), ${changed} changed`);
  },
  { connection: createRedisConnection(required("REDIS_URL")), concurrency: 1 },
);
modelsSync.on("failed", (_job, error) => console.error("models-sync failed:", error.message));
modelsSync.on("error", (error) => console.error("models-sync error:", error.message));
const modelsSyncQueue = createModelsSyncQueue(required("REDIS_URL"));
await scheduleModelsSync(modelsSyncQueue);

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await Promise.all([worker.close(), modelsSync.close(), modelsSyncQueue.close()]);
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log(`worker listening on ${THREAD_TITLE_QUEUE} and ${MODELS_SYNC_QUEUE}`);
