// What an uploaded file is, from its bytes. Shared with the web app, so
// nothing here touches the database or the document engine.

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 8;
/** What the model reads of one document or text file, at most. */
export const MAX_FILE_CHARS = 100_000;

/** The images every chat model that sees takes. Others are read as documents or refused. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export type FileKind = "image" | "pdf" | "text" | "document";

function startsWith(bytes: Uint8Array, signature: number[]) {
  return bytes.length >= signature.length && signature.every((value, i) => bytes[i] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** The image type the bytes start like, or null. The name and the browser's type are not trusted. */
export function imageTypeOf(bytes: Uint8Array): (typeof IMAGE_TYPES)[number] | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export const isPdf = (bytes: Uint8Array) => ascii(bytes, 0, 5) === "%PDF-";

const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * The file as text when it is UTF-8 with no NUL byte, else null. Code,
 * Markdown, CSV and the like have no reliable type from a browser (a `.ts`
 * file can arrive as video/mp2t), so the bytes decide. RTF is text too, but
 * reads better converted.
 */
export function textOf(bytes: Uint8Array): string | null {
  if (bytes.includes(0) || ascii(bytes, 0, 5) === "{\\rtf") return null;
  try {
    return decoder.decode(bytes).replace(/^﻿/, "");
  } catch {
    return null;
  }
}

/** How the composer and the transcript draw a file, from its stored media type. */
export function kindOf(mediaType: string): FileKind {
  if ((IMAGE_TYPES as readonly string[]).includes(mediaType)) return "image";
  if (mediaType === "application/pdf") return "pdf";
  if (mediaType === "text/plain") return "text";
  return "document";
}

/** What the composer gets back for one file; a message's file part points at `url`. */
export type UploadedFile = {
  id: string;
  url: string;
  name: string;
  mediaType: string;
  size: number;
};

export const fileUrl = (id: string) => `/api/files/${id}`;

/** The upload a file part points at, when it points at one. */
export function uploadIdOf(url: string): string | null {
  return /^\/api\/files\/([A-Za-z0-9_-]+)$/.exec(url)?.[1] ?? null;
}
