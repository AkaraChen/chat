import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createTestDb } from "../chat/testing";
import type { Context } from "../context";
import { mintExportToken } from "../export/token";
import { handleFileRead, handleFileUpload } from "./http";
import { imageTypeOf, MAX_FILE_CHARS, textOf, type UploadedFile } from "./kind";
import { prepareUpload, UnreadableFileError } from "./store";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];

const file = (bytes: ArrayLike<number> | string, name: string, type = "") =>
  new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], name, { type });

// Stands in for here-docs: a PDF or a .docx reads as Markdown, anything else as nothing.
const reads: string[] = [];
const readDocument = async (_bytes: Uint8Array, name: string) => {
  reads.push(name);
  return /\.(pdf|docx|rtf)$/.test(name) ? `# ${name}` : null;
};

describe("sorting a file", () => {
  test("the bytes decide, not the name or the browser's type", async () => {
    expect(imageTypeOf(new Uint8Array(PNG))).toBe("image/png");
    expect(imageTypeOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(imageTypeOf(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(imageTypeOf(new TextEncoder().encode("<svg/>"))).toBeNull();

    const image = await prepareUpload(file(PNG, "cat.txt", "text/plain"), readDocument);
    expect(image).toMatchObject({ name: "cat.txt", mediaType: "image/png", text: null });

    // A .ts file can arrive as video/mp2t; it is text.
    const code = await prepareUpload(
      file("﻿export const a = 1;\n", "a.ts", "video/mp2t"),
      readDocument,
    );
    expect(code).toMatchObject({ mediaType: "text/plain", text: "export const a = 1;\n" });

    expect(textOf(new Uint8Array([0x61, 0, 0x62]))).toBeNull();
    expect(textOf(new Uint8Array([0xc3, 0x28]))).toBeNull();
  });

  test("documents go to the reader, and what it cannot read is refused", async () => {
    reads.length = 0;
    const pdf = await prepareUpload(
      file("%PDF-1.7\n...", "report.pdf", "application/pdf"),
      readDocument,
    );
    expect(pdf).toMatchObject({ mediaType: "application/pdf", text: "# report.pdf" });

    const docx = await prepareUpload(
      file(
        [0x50, 0x4b, 0x03, 0x04, 0xff],
        "plan.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
      readDocument,
    );
    expect(docx.mediaType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    // RTF is UTF-8, but reads better converted.
    await prepareUpload(file("{\\rtf1 hello}", "note.rtf"), readDocument);
    expect(reads).toEqual(["report.pdf", "plan.docx", "note.rtf"]);

    await expect(prepareUpload(file([0, 1, 2, 0xff], "blob.bin"), readDocument)).rejects.toThrow(
      "Only images, PDFs, office documents and text files",
    );
    await expect(prepareUpload(file("%PDF-1.7\n", "scan.pdf"), async () => null)).rejects.toThrow(
      "Couldn't find any text in this PDF.",
    );
    await expect(prepareUpload(file("", "empty.txt"), readDocument)).rejects.toBeInstanceOf(
      UnreadableFileError,
    );
  });

  test("a long text file is cut to what one file may hand the model", async () => {
    const long = await prepareUpload(
      file("a".repeat(MAX_FILE_CHARS + 10), "log.txt"),
      readDocument,
    );
    expect(long.text!.startsWith("a".repeat(MAX_FILE_CHARS))).toBe(true);
    expect(long.text).toContain("[Stopped reading: the rest is past what one file can hold.]");
  });
});

let t: Awaited<ReturnType<typeof createTestDb>>;
let base: Context;

beforeAll(async () => {
  t = await createTestDb();
  for (const id of ["u1", "u2", "v1"]) {
    await t.db.user.create({
      data: {
        id,
        name: id,
        email: `${id}@x.test`,
        username: id,
        role: id === "v1" ? "visitor" : "user",
      },
    });
  }
  base = { db: t.db, readDocument, authSecret: "secret", session: null } as unknown as Context;
});

afterAll(() => t.cleanup());

const as = (userId: string | null, role: "user" | "visitor" = "user"): Context => ({
  ...base,
  session: userId ? { userId, role } : null,
});

function post(context: Context, body: File | null) {
  const form = new FormData();
  if (body) form.append("file", body);
  return handleFileUpload(
    context,
    new Request("http://app.test/api/files", { method: "POST", body: form }),
  );
}

const get = (context: Context, id: string, query = "") =>
  handleFileRead(context, new Request(`http://app.test/api/files/${id}${query}`), id);

describe("/api/files", () => {
  test("a member uploads, and only they read it back", async () => {
    const response = await post(as("u1"), file(PNG, "shot.png", "image/png"));
    expect(response.status).toBe(200);
    const uploaded = (await response.json()) as UploadedFile;
    expect(uploaded).toMatchObject({ name: "shot.png", mediaType: "image/png", size: PNG.length });
    expect(uploaded.url).toBe(`/api/files/${uploaded.id}`);

    const mine = await get(as("u1"), uploaded.id);
    expect(mine.status).toBe(200);
    expect(mine.headers.get("content-type")).toBe("image/png");
    expect(mine.headers.get("x-content-type-options")).toBe("nosniff");
    expect([...new Uint8Array(await mine.arrayBuffer())]).toEqual(PNG);

    expect((await get(as("u2"), uploaded.id)).status).toBe(404);
    expect((await get(as(null), uploaded.id)).status).toBe(404);
  });

  test("text comes back as plain text, and other documents download", async () => {
    const text = (await (
      await post(as("u1"), file("<b>hi</b>", "page.html", "text/html"))
    ).json()) as UploadedFile;
    const page = await get(as("u1"), text.id);
    expect(page.headers.get("content-type")).toBe("text/plain; charset=utf-8");

    const docx = (await (
      await post(
        as("u1"),
        file([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff], "计划.docx", "application/zip"),
      )
    ).json()) as UploadedFile;
    const download = await get(as("u1"), docx.id);
    expect(download.headers.get("content-type")).toBe("application/octet-stream");
    expect(download.headers.get("content-disposition")).toBe(
      `attachment; filename="__.docx"; filename*=UTF-8''${encodeURIComponent("计划.docx")}`,
    );
  });

  test("visitors, missing files, and what cannot be read are refused", async () => {
    expect((await post(as(null), file("x", "x.txt"))).status).toBe(401);
    expect((await post(as("v1", "visitor"), file("x", "x.txt"))).status).toBe(403);
    expect((await post(as("u1"), null)).status).toBe(400);
    const refused = await post(as("u1"), file([0, 1, 2], "blob.bin"));
    expect(refused.status).toBe(415);
    expect(await refused.text()).toContain("Only images, PDFs");
  });

  test("a shared chat's link reads that chat's files, on the link's terms", async () => {
    const thread = await t.db.thread.create({ data: { userId: "u1", title: "t" } });
    const uploaded = (await (await post(as("u1"), file(PNG, "shot.png"))).json()) as UploadedFile;
    await t.db.upload.update({ where: { id: uploaded.id }, data: { threadId: thread.id } });

    const mint = (access: "public" | "signed-in", threadId = thread.id) =>
      mintExportToken({
        secret: "secret",
        threadId,
        access,
        expiresAt: new Date(Date.now() + 60_000),
        until: null,
      });
    const share = (token: string) => `?share=${encodeURIComponent(token)}`;

    expect((await get(as(null), uploaded.id, share(mint("public")))).status).toBe(200);
    expect((await get(as(null), uploaded.id, share(mint("signed-in")))).status).toBe(404);
    expect((await get(as("u2"), uploaded.id, share(mint("signed-in")))).status).toBe(200);

    const other = await t.db.thread.create({ data: { userId: "u1", title: "other" } });
    expect((await get(as(null), uploaded.id, share(mint("public", other.id)))).status).toBe(404);
    expect((await get(as(null), uploaded.id, `${share(mint("public"))}x`)).status).toBe(404);
  });
});
