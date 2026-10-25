import type { Queue } from "bullmq";

import type { CredentialStore } from "../credentials/store";
import type { ModelsDev } from "../models/models-dev";
import { syncConnectionModels, type SyncResult } from "../models/sync";

export const MODELS_SYNC_QUEUE = "models-sync";
export const MODELS_SYNC_EVERY_MS = 12 * 60 * 60 * 1000;
const SCHEDULER_ID = "models-sync-every-12h";

export type ModelsSyncQueue = Pick<Queue, "upsertJobScheduler">;

/**
 * Syncs every connection's models from models.dev twice a day. An `every`
 * scheduler runs first as soon as it is created, so the first deploy catches
 * up at once. A fixed id is idempotent: restarts keep the one schedule.
 */
export function scheduleModelsSync(queue: ModelsSyncQueue) {
  return queue.upsertJobScheduler(
    SCHEDULER_ID,
    { every: MODELS_SYNC_EVERY_MS },
    { name: "sync", opts: { removeOnComplete: true, removeOnFail: 20 } },
  );
}

/** One run: models.dev is downloaded again, then every connection is synced. */
export async function runModelsSync(deps: {
  credentials: CredentialStore;
  modelsDev: ModelsDev;
}): Promise<SyncResult[]> {
  return syncConnectionModels(deps.credentials, await deps.modelsDev.refresh());
}
