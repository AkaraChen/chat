import type { Database } from "@my-better-t-app/db";
import type { Role } from "@my-better-t-app/db/auth";

import type { ChatMessage } from "../chat/message";
import { exportExpiresAt, type ExportAccess, type ExportDuration } from "./duration";
import { mintExportToken, verifyExportToken } from "./token";

export class ExportDenied extends Error {
  constructor() {
    super("You can't export this chat.");
  }
}

export class ExportMissing extends Error {
  constructor() {
    super("Chat not found.");
  }
}

export type ExportActor = { userId: string; role: Role };

export type SharedThread = {
  title: string;
  messages: ChatMessage[];
};

export type ShareResult =
  | { status: "ok"; thread: SharedThread }
  | { status: "forbidden" }
  | { status: "invalid" };

function canMint(role: Role): boolean {
  return role === "admin" || role === "user";
}

function messageOf(row: {
  id: string;
  role: string;
  parts: string;
  metadata: string | null;
}): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    parts: JSON.parse(row.parts),
    ...(row.metadata ? { metadata: JSON.parse(row.metadata) } : {}),
  } as ChatMessage;
}

/**
 * Mint a stateless link for a thread the actor owns. Visitors and anyone
 * else are refused. This writes nothing.
 */
export async function mintThreadExport(input: {
  db: Database;
  secret: string;
  actor: ExportActor;
  threadId: string;
  access: ExportAccess;
  duration: ExportDuration;
  now?: Date;
}): Promise<{ token: string; access: ExportAccess; expiresAt: Date }> {
  if (!canMint(input.actor.role)) throw new ExportDenied();
  const now = input.now ?? new Date();
  const thread = await input.db.thread.findFirst({
    where: { id: input.threadId, userId: input.actor.userId },
    select: { id: true },
  });
  if (!thread) throw new ExportMissing();
  const rows = await input.db.message.findMany({
    where: { threadId: thread.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { createdAt: true },
  });
  const latest = rows.at(-1)?.createdAt ?? null;
  const expiresAt = exportExpiresAt(input.duration, now);
  const token = mintExportToken({
    secret: input.secret,
    threadId: thread.id,
    access: input.access,
    expiresAt,
    until: latest ? latest.toISOString() : null,
  });
  return { token, access: input.access, expiresAt };
}

/**
 * The thread as it was at mint time. A public link needs no session. A
 * signed-in link needs any session on this instance. An expired, tampered,
 * or unknown link returns nothing, and this writes nothing.
 */
export async function resolveThreadExport(input: {
  db: Database;
  secret: string;
  token: string;
  session: ExportActor | null;
  now?: Date;
}): Promise<ShareResult> {
  const now = input.now ?? new Date();
  const claims = verifyExportToken(input.token, input.secret, now);
  if (!claims) return { status: "invalid" };
  if (claims.acc === "signed-in" && !input.session) return { status: "forbidden" };
  const thread = await input.db.thread.findUnique({
    where: { id: claims.tid },
    select: { title: true },
  });
  if (!thread) return { status: "invalid" };
  const until = claims.until ? Date.parse(claims.until) : null;
  const rows = await input.db.message.findMany({
    where: { threadId: claims.tid },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const messages =
    until == null ? [] : rows.filter((row) => row.createdAt.getTime() <= until).map(messageOf);
  return { status: "ok", thread: { title: thread.title, messages } };
}
