import { Queue } from "bullmq";
import { Redis } from "ioredis";

import { THREAD_TITLE_QUEUE, type ThreadTitleJob } from "./thread-title";

// BullMQ 6 does not load ioredis itself under ESM, so it is handed a client.
// Its blocking commands need maxRetriesPerRequest unset.
export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}

export function createThreadTitleQueue(redisUrl: string): Queue<ThreadTitleJob> {
  return new Queue<ThreadTitleJob>(THREAD_TITLE_QUEUE, {
    connection: createRedisConnection(redisUrl),
  });
}
