import { MAX_FILE_CHARS } from "./kind";

/**
 * Reads a PDF or office document (Word, PowerPoint, Excel, OpenDocument,
 * RTF, EPUB, CSV) as Markdown. Null when there is no text in it to read, or
 * it is not a document.
 */
export type DocumentReader = (bytes: Uint8Array, filename: string) => Promise<string | null>;

type Engine = Awaited<ReturnType<typeof import("here-docs").createEngine>>;

// A scan is read page by page with OCR, which is slow; past this the upload
// gives up rather than keep the request open.
const READ_TIMEOUT_MS = 2 * 60 * 1000;
// The engine holds the OCR models in memory. It closes when nothing has been
// read for a while and opens again on the next document.
const IDLE_CLOSE_MS = 10 * 60 * 1000;

/** The cut that keeps a long document within what one file may hand the model. */
export function cut(markdown: string, page: number | null, pageCount: number | null): string {
  const kept = markdown.slice(0, MAX_FILE_CHARS);
  const where = page && pageCount ? ` after page ${page} of ${pageCount}` : "";
  return `${kept}\n\n[Stopped reading${where}: the rest is past what one file can hold.]`;
}

/**
 * here-docs (https://github.com/AkaraChen/here-docs), on this machine. Text
 * PDFs and office files are converted as they are; scanned pages go through
 * OCR. One document is read at a time, so a few uploads at once do not take
 * every core. The engine and its native packages load on the first document.
 */
export function createDocumentReader(): DocumentReader {
  let engine: Promise<Engine> | null = null;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const open = () => {
    if (!engine) {
      const attempt = import("here-docs").then((m) => m.createEngine());
      // A failed start is not kept, so the next document tries again.
      attempt.catch(() => {
        if (engine === attempt) engine = null;
      });
      engine = attempt;
    }
    return engine;
  };

  const closeLater = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      const current = engine;
      engine = null;
      void current?.then((e) => e.close()).catch(() => {});
    }, IDLE_CLOSE_MS);
    idle.unref?.();
  };

  async function read(bytes: Uint8Array, filename: string): Promise<string | null> {
    clearTimeout(idle);
    const { convertPages } = await import("here-docs");
    const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
    const sections: string[] = [];
    let length = 0;
    for await (const part of convertPages(bytes, { filename, engine: await open(), signal })) {
      const markdown = part.markdown.trim();
      if (!markdown) continue;
      sections.push(markdown);
      length += markdown.length;
      // Breaking out skips the pages after, so a long scan is not OCR'd to the end.
      if (length > MAX_FILE_CHARS) return cut(sections.join("\n\n"), part.page, part.pageCount);
    }
    return sections.length > 0 ? sections.join("\n\n") : null;
  }

  return (bytes, filename) => {
    const run = queue.then(() => read(bytes, filename));
    queue = run.catch(() => {}).finally(closeLater);
    return run;
  };
}
