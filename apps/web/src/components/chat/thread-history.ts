import { orpc } from "@/utils/orpc";

/** The first message of a thread started from the empty state, sent once it opens. */
export type Pending = { threadId: string; text: string };

/**
 * A thread's stored messages. The cache is kept, so a thread opened again
 * shows at once while it is read again in the background; the live chat
 * writes its messages back when an answer ends. Hovering a thread in the
 * sidebar reads it ahead, and a read in the last few seconds is reused.
 */
export const historyQuery = (id: string) =>
  orpc.threads.get.queryOptions({
    input: { id },
    staleTime: 5000,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { quiet: true },
  });
