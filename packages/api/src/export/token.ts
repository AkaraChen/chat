import { createHmac, timingSafeEqual } from "node:crypto";

import type { ExportAccess } from "./duration";

// A JWT-shaped token: claims, then an HMAC. Nothing here is stored. The key
// is derived from the Better Auth secret for this one use, so a share link's
// MAC is never a MAC Better Auth would accept for a cookie, or the reverse.
export type ExportClaims = {
  v: 1;
  tid: string;
  acc: ExportAccess;
  /** Unix milliseconds. The link is past at this instant. */
  exp: number;
  /** Newest message `createdAt` included, or null when the thread was empty. */
  until: string | null;
};

function payloadOf(claims: ExportClaims): string {
  return Buffer.from(
    JSON.stringify({
      v: claims.v,
      tid: claims.tid,
      acc: claims.acc,
      exp: claims.exp,
      until: claims.until,
    }),
  ).toString("base64url");
}

const KEY_LABEL = "chat-export-v1";

function keyOf(secret: string): Buffer {
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

function macOf(secret: string, payload: string): string {
  return createHmac("sha256", keyOf(secret)).update(payload).digest("base64url");
}

function sameMac(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function mintExportToken(input: {
  secret: string;
  threadId: string;
  access: ExportAccess;
  expiresAt: Date;
  until: string | null;
}): string {
  const payload = payloadOf({
    v: 1,
    tid: input.threadId,
    acc: input.access,
    exp: input.expiresAt.getTime(),
    until: input.until,
  });
  return `${payload}.${macOf(input.secret, payload)}`;
}

function claimsOf(value: unknown): ExportClaims | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.v !== 1) return null;
  if (typeof row.tid !== "string" || row.tid.length === 0) return null;
  if (row.acc !== "signed-in" && row.acc !== "public") return null;
  if (typeof row.exp !== "number" || !Number.isFinite(row.exp)) return null;
  if (row.until !== null && typeof row.until !== "string") return null;
  return { v: 1, tid: row.tid, acc: row.acc, exp: row.exp, until: row.until };
}

/** Null when the secret, any claim, or the expiry does not check out. */
export function verifyExportToken(token: string, secret: string, now: Date): ExportClaims | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!sameMac(mac, macOf(secret, payload))) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const claims = claimsOf(parsed);
  if (!claims || now.getTime() >= claims.exp) return null;
  return claims;
}
