import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

import { call } from "@orpc/server";

import { createTestDb } from "../chat/testing";
import type { Context } from "../context";
import { appRouter } from "../routers/index";
import { exportDurationMs, exportDurations, type ExportDuration } from "./duration";
import { ExportDenied, ExportMissing, mintThreadExport, resolveThreadExport } from "./share";
import { mintExportToken, verifyExportToken, type ExportClaims } from "./token";

const secret = "better-auth-secret";
const now = new Date("2026-10-25T12:00:00.000Z");

let db: Awaited<ReturnType<typeof createTestDb>>;

async function counts() {
  return {
    users: await db.db.user.count(),
    threads: await db.db.thread.count(),
    messages: await db.db.message.count(),
  };
}

function textOf(messages: { parts: unknown }[]) {
  return JSON.stringify(messages);
}

function tamper(token: string, edit: (claims: ExportClaims) => void): string {
  const dot = token.indexOf(".");
  const claims = JSON.parse(
    Buffer.from(token.slice(0, dot), "base64url").toString("utf8"),
  ) as ExportClaims;
  edit(claims);
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${token.slice(dot + 1)}`;
}

beforeAll(async () => {
  db = await createTestDb();
  await db.db.user.createMany({
    data: [
      { id: "owner", name: "Owner", email: "owner@x.test", role: "user" },
      { id: "other", name: "Other", email: "other@x.test", role: "user" },
      { id: "guest", name: "Guest", email: "guest@x.test", role: "visitor" },
      { id: "admin", name: "Admin", email: "admin@x.test", role: "admin" },
    ],
  });
});

afterAll(() => db.cleanup());

describe("stateless export token", () => {
  test("durations are 10 minutes, 1 hour, 1 day, and 7 days", () => {
    for (const duration of exportDurations) {
      const expiresAt = new Date(now.getTime() + exportDurationMs[duration]);
      const token = mintExportToken({
        secret,
        threadId: "thread-1",
        access: "signed-in",
        expiresAt,
        until: "2026-10-25T11:00:00.000Z",
      });
      const claims = verifyExportToken(token, secret, now);
      expect(claims?.exp).toBe(expiresAt.getTime());
      expect(claims?.acc).toBe("signed-in");
      expect(claims?.until).toBe("2026-10-25T11:00:00.000Z");
      expect(verifyExportToken(token, secret, expiresAt)).toBeNull();
    }
    expect(exportDurationMs["10m"]).toBe(10 * 60 * 1000);
    expect(exportDurationMs["1h"]).toBe(60 * 60 * 1000);
    expect(exportDurationMs["1d"]).toBe(24 * 60 * 60 * 1000);
    expect(exportDurationMs["7d"]).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test("the MAC is keyed by a key derived for exports, not the auth secret itself", () => {
    const token = mintExportToken({
      secret,
      threadId: "thread-1",
      access: "public",
      expiresAt: new Date(now.getTime() + exportDurationMs["1d"]),
      until: null,
    });
    const payload = token.split(".")[0]!;
    // What Better Auth would make with the raw secret is not a valid link.
    const raw = createHmac("sha256", secret).update(payload).digest("base64url");
    expect(token.endsWith(`.${raw}`)).toBe(false);
    expect(verifyExportToken(`${payload}.${raw}`, secret, now)).toBeNull();
    expect(verifyExportToken(token, secret, now)).not.toBeNull();
  });

  test("wrong secret and mutated claims fail", () => {
    const token = mintExportToken({
      secret,
      threadId: "thread-1",
      access: "public",
      expiresAt: new Date(now.getTime() + exportDurationMs["1d"]),
      until: "2026-10-25T11:00:00.000Z",
    });
    expect(verifyExportToken(token, "other-secret", now)).toBeNull();
    expect(tamper(token, (claims) => (claims.acc = "signed-in"))).not.toBe(token);
    for (const edited of [
      tamper(token, (claims) => (claims.acc = "signed-in")),
      tamper(token, (claims) => (claims.tid = "thread-2")),
      tamper(token, (claims) => (claims.exp = claims.exp + 1000)),
      tamper(token, (claims) => (claims.until = "2026-10-26T11:00:00.000Z")),
      `${token}x`,
    ]) {
      expect(verifyExportToken(edited, secret, now)).toBeNull();
    }
  });

  test("past expiry fails and the instant before it holds", () => {
    const expiresAt = new Date(now.getTime() + exportDurationMs["10m"]);
    const token = mintExportToken({
      secret,
      threadId: "thread-1",
      access: "public",
      expiresAt,
      until: null,
    });
    expect(verifyExportToken(token, secret, new Date(expiresAt.getTime() - 1))?.tid).toBe(
      "thread-1",
    );
    expect(verifyExportToken(token, secret, expiresAt)).toBeNull();
  });
});

describe("mint and resolve", () => {
  async function threadWith(text: string) {
    const thread = await db.db.thread.create({
      data: { userId: "owner", title: "Launch review" },
    });
    await db.db.message.create({
      data: {
        id: `${thread.id}-kept`,
        threadId: thread.id,
        role: "user",
        parts: JSON.stringify([{ type: "text", text }]),
        createdAt: new Date("2026-10-25T11:00:00.000Z"),
      },
    });
    return thread;
  }

  async function mint(
    threadId: string,
    extra: {
      actor?: { userId: string; role: "admin" | "user" | "visitor" };
      access?: "signed-in" | "public";
      duration?: ExportDuration;
      secret?: string;
    } = {},
  ) {
    return mintThreadExport({
      db: db.db,
      secret: extra.secret ?? secret,
      actor: extra.actor ?? { userId: "owner", role: "user" },
      threadId,
      access: extra.access ?? "public",
      duration: extra.duration ?? "1d",
      now,
    });
  }

  test("owner mint is allowed for a user and an admin", async () => {
    const owned = await threadWith("already here");
    const minted = await mint(owned.id, { access: "signed-in" });
    expect(minted.token.split(".").length).toBe(2);
    expect(verifyExportToken(minted.token, secret, now)?.tid).toBe(owned.id);

    const adminThread = await db.db.thread.create({
      data: { userId: "admin", title: "Admin notes" },
    });
    const asAdmin = await mint(adminThread.id, {
      actor: { userId: "admin", role: "admin" },
      access: "public",
    });
    const resolved = await resolveThreadExport({
      db: db.db,
      secret,
      token: asAdmin.token,
      session: null,
      now,
    });
    expect(resolved.status).toBe("ok");
    if (resolved.status === "ok") expect(resolved.thread.title).toBe("Admin notes");
  });

  test("other-user and visitor mint denial", async () => {
    const owned = await threadWith("private");
    const guestThread = await db.db.thread.create({
      data: { userId: "guest", title: "Guest notes" },
    });
    await expect(
      mint(owned.id, { actor: { userId: "other", role: "user" } }),
    ).rejects.toBeInstanceOf(ExportMissing);
    await expect(
      mint(owned.id, { actor: { userId: "admin", role: "admin" } }),
    ).rejects.toBeInstanceOf(ExportMissing);
    await expect(
      mint(guestThread.id, { actor: { userId: "guest", role: "visitor" } }),
    ).rejects.toBeInstanceOf(ExportDenied);
    await expect(mint("missing")).rejects.toBeInstanceOf(ExportMissing);
  });

  test("public resolves with no session and signed-in resolves for any account", async () => {
    const owned = await threadWith("snapshot line");
    const open = await mint(owned.id, { access: "public" });
    const closed = await mint(owned.id, { access: "signed-in" });

    const publicRead = await resolveThreadExport({
      db: db.db,
      secret,
      token: open.token,
      session: null,
      now,
    });
    expect(publicRead.status).toBe("ok");
    if (publicRead.status === "ok")
      expect(textOf(publicRead.thread.messages)).toContain("snapshot line");

    const signedOut = await resolveThreadExport({
      db: db.db,
      secret,
      token: closed.token,
      session: null,
      now,
    });
    expect(signedOut.status).toBe("forbidden");
    expect(JSON.stringify(signedOut)).not.toContain("snapshot line");

    for (const session of [
      { userId: "guest", role: "visitor" as const },
      { userId: "other", role: "user" as const },
    ]) {
      const read = await resolveThreadExport({
        db: db.db,
        secret,
        token: closed.token,
        session,
        now,
      });
      expect(read.status).toBe("ok");
      if (read.status === "ok") expect(read.thread.title).toBe("Launch review");
    }
  });

  test("all four durations expire on their offset", async () => {
    const owned = await threadWith("timed");
    for (const duration of exportDurations) {
      const minted = await mint(owned.id, { duration, access: "public" });
      expect(minted.expiresAt.getTime() - now.getTime()).toBe(exportDurationMs[duration]);
      const open = await resolveThreadExport({
        db: db.db,
        secret,
        token: minted.token,
        session: null,
        now: new Date(minted.expiresAt.getTime() - 1),
      });
      expect(open.status).toBe("ok");
      const past = await resolveThreadExport({
        db: db.db,
        secret,
        token: minted.token,
        session: null,
        now: minted.expiresAt,
      });
      expect(past.status).toBe("invalid");
      expect(JSON.stringify(past)).not.toContain("Launch review");
    }
  });

  test("wrong secret, mutated claims, and past expiry do not return the thread", async () => {
    const owned = await threadWith("sealed");
    const minted = await mint(owned.id, { access: "public" });
    const wrong = await resolveThreadExport({
      db: db.db,
      secret: "not-the-secret",
      token: minted.token,
      session: null,
      now,
    });
    expect(wrong.status).toBe("invalid");
    const mutated = await resolveThreadExport({
      db: db.db,
      secret,
      token: tamper(minted.token, (claims) => (claims.until = "2026-10-26T00:00:00.000Z")),
      session: null,
      now,
    });
    expect(mutated.status).toBe("invalid");
    const expired = await resolveThreadExport({
      db: db.db,
      secret,
      token: minted.token,
      session: null,
      now: minted.expiresAt,
    });
    expect(expired.status).toBe("invalid");
    for (const result of [wrong, mutated, expired]) {
      expect(JSON.stringify(result)).not.toContain("sealed");
    }
  });

  test("a message saved later is absent and resolve does not write", async () => {
    const owned = await threadWith("already here");
    const before = await counts();
    const minted = await mint(owned.id, { access: "public" });
    expect(await counts()).toEqual(before);

    await db.db.message.create({
      data: {
        id: `${owned.id}-later`,
        threadId: owned.id,
        role: "user",
        parts: JSON.stringify([{ type: "text", text: "saved later" }]),
        createdAt: new Date("2026-10-25T12:30:00.000Z"),
      },
    });
    const stored = await db.db.message.findUnique({ where: { id: `${owned.id}-kept` } });
    const read = await resolveThreadExport({
      db: db.db,
      secret,
      token: minted.token,
      session: null,
      now,
    });
    expect(read.status).toBe("ok");
    if (read.status === "ok") {
      const body = textOf(read.thread.messages);
      expect(body).toContain("already here");
      expect(body).not.toContain("saved later");
    }
    const after = await db.db.message.findUnique({ where: { id: `${owned.id}-kept` } });
    expect(after?.parts).toBe(stored?.parts);
    expect(await counts()).toEqual({ ...before, messages: before.messages + 1 });
  });

  test("mint and resolve add no share row and work from the token alone", async () => {
    const owned = await threadWith("only the token");
    const before = await counts();
    const minted = await mint(owned.id, { access: "public", duration: "1h" });
    const read = await resolveThreadExport({
      db: db.db,
      secret,
      token: minted.token,
      session: null,
      now,
    });
    expect(await counts()).toEqual(before);
    expect(read.status).toBe("ok");
    if (read.status === "ok") expect(textOf(read.thread.messages)).toContain("only the token");

    const tables = await db.db.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const names = tables.map((row) => row.name);
    expect(names).not.toContain("share");
    expect(names).not.toContain("export");
    expect(names).not.toContain("token");
  });

  test("the export procedure mints a token resolve accepts", async () => {
    const owned = await threadWith("through the procedure");
    const before = await counts();
    const minted = await call(
      appRouter.threads.export,
      { id: owned.id, access: "public", duration: "1h" },
      {
        context: {
          db: db.db,
          authSecret: secret,
          session: { userId: "owner", role: "user" },
        } as Context,
      },
    );
    expect(minted.access).toBe("public");
    expect(await counts()).toEqual(before);
    const read = await resolveThreadExport({
      db: db.db,
      secret,
      token: minted.token,
      session: null,
    });
    expect(read.status).toBe("ok");
    if (read.status === "ok") {
      expect(textOf(read.thread.messages)).toContain("through the procedure");
    }
    await expect(
      call(
        appRouter.threads.export,
        { id: owned.id, access: "public", duration: "1d" },
        {
          context: {
            db: db.db,
            authSecret: secret,
            session: { userId: "guest", role: "visitor" },
          } as Context,
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
