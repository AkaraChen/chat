import type { DocumentReader } from "./documents";
import { cut } from "./documents";
import { imageTypeOf, isPdf, MAX_FILE_CHARS, textOf } from "./kind";

export class UnreadableFileError extends Error {}

/** An upload before it is saved: what is served back, and what the model reads. */
export type PreparedUpload = {
  name: string;
  mediaType: string;
  size: number;
  data: Uint8Array<ArrayBuffer>;
  /** What the model reads of a document or text file. Null for an image. */
  text: string | null;
};

const MEDIA_TYPE = /^[\w.+-]+\/[\w.+-]+$/;

// The name is shown and sent to the model, never used as a path.
function nameOf(file: File): string {
  const base = file.name.split(/[/\\]/).pop()?.trim() ?? "";
  return base.slice(0, 200) || "file";
}

/**
 * Sorts a file by its bytes: an image the model can look at, a document
 * here-docs reads as Markdown, or UTF-8 text taken as it is. Anything else,
 * and a document with no text to read, is refused.
 */
export async function prepareUpload(
  file: File,
  readDocument: DocumentReader,
): Promise<PreparedUpload> {
  const data = new Uint8Array(await file.arrayBuffer());
  const name = nameOf(file);
  const base = { name, size: data.byteLength, data };
  if (data.byteLength === 0) throw new UnreadableFileError("The file is empty.");

  const image = imageTypeOf(data);
  if (image) return { ...base, mediaType: image, text: null };

  const pdf = isPdf(data);
  const text = pdf ? null : textOf(data);
  if (text !== null) {
    if (!text.trim()) throw new UnreadableFileError("The file is empty.");
    const kept = text.length > MAX_FILE_CHARS ? cut(text, null, null) : text;
    return { ...base, mediaType: "text/plain", text: kept };
  }

  const markdown = await readDocument(data, name).catch((error: unknown) => {
    console.error("document was not read:", error instanceof Error ? error.message : error);
    throw new UnreadableFileError("Couldn't read this file.");
  });
  if (!markdown) {
    throw new UnreadableFileError(
      pdf
        ? "Couldn't find any text in this PDF."
        : "Only images, PDFs, office documents and text files can be attached.",
    );
  }
  const mediaType = pdf
    ? "application/pdf"
    : MEDIA_TYPE.test(file.type)
      ? file.type
      : "application/octet-stream";
  return { ...base, mediaType, text: markdown };
}
