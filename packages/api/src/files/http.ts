import type { Context } from "../context";
import { verifyExportToken } from "../export/token";
import { fileUrl, kindOf, MAX_FILE_BYTES, type UploadedFile } from "./kind";
import { prepareUpload, UnreadableFileError } from "./store";

const fail = (status: number, message: string) => new Response(message, { status });

// The form around the file is small; a body past this is refused unread.
const FORM_OVERHEAD = 64 * 1024;

/**
 * POST /api/files: one file, as the `file` field of a multipart form. Members
 * only. Documents are read here, so a file the model could not read is
 * refused before it is ever sent.
 */
export async function handleFileUpload(context: Context, request: Request): Promise<Response> {
  const { session } = context;
  if (!session) return fail(401, "Sign in first.");
  if (session.role === "visitor") return fail(403, "Only members can attach files.");

  const tooLarge = `A file can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_FILE_BYTES + FORM_OVERHEAD) return fail(413, tooLarge);
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "Send one file as `file`.");
  if (file.size > MAX_FILE_BYTES) return fail(413, tooLarge);

  let prepared;
  try {
    prepared = await prepareUpload(file, context.readDocument);
  } catch (error) {
    if (error instanceof UnreadableFileError) return fail(415, error.message);
    throw error;
  }
  const row = await context.db.upload.create({
    data: {
      userId: session.userId,
      name: prepared.name,
      mediaType: prepared.mediaType,
      size: prepared.size,
      data: prepared.data,
      text: prepared.text,
    },
    select: { id: true, name: true, mediaType: true, size: true },
  });
  return Response.json({ ...row, url: fileUrl(row.id) } satisfies UploadedFile);
}

// RFC 6266: an ASCII fallback, and the real name for browsers that read it.
function disposition(type: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * GET /api/files/:id. The owner reads their own files. A shared chat's link
 * (`?share=<token>`) reads the files of that chat, on the link's terms.
 * Images and PDFs open in the browser; text comes as plain text; other
 * documents download.
 */
export async function handleFileRead(
  context: Context,
  request: Request,
  id: string,
): Promise<Response> {
  const upload = await context.db.upload.findUnique({
    where: { id },
    select: { userId: true, threadId: true, name: true, mediaType: true, data: true },
  });
  if (!upload) return fail(404, "Not found.");

  const { session } = context;
  const share = new URL(request.url).searchParams.get("share");
  const claims = share ? verifyExportToken(share, context.authSecret, new Date()) : null;
  const owner = session !== null && session.userId === upload.userId;
  const shared =
    claims !== null &&
    upload.threadId !== null &&
    claims.tid === upload.threadId &&
    (claims.acc === "public" || session !== null);
  // Not 403: whether a file exists is not for anyone else to learn.
  if (!owner && !shared) return fail(404, "Not found.");

  const kind = kindOf(upload.mediaType);
  const headers = new Headers({
    "content-length": String(upload.data.byteLength),
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  if (kind === "image" || kind === "pdf") {
    headers.set("content-type", upload.mediaType);
    headers.set("content-disposition", disposition("inline", upload.name));
  } else if (kind === "text") {
    headers.set("content-type", "text/plain; charset=utf-8");
    headers.set("content-disposition", disposition("inline", upload.name));
  } else {
    headers.set("content-type", "application/octet-stream");
    headers.set("content-disposition", disposition("attachment", upload.name));
  }
  return new Response(upload.data, { headers });
}
