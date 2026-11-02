import type { Database } from "@my-better-t-app/db";
import { generateText, type LanguageModel } from "ai";

import { kindOf, uploadIdOf } from "../files/kind";
import type { ChatMessage, ChatPart } from "./message";

/** What is known about the chat model's eyes, and the image model set for it. */
export type ImageInput = {
  /** From models.dev. Undefined when it does not list the model. */
  sees?: boolean;
  helper?: { connectionId: string; modelId: string } | null;
};

/**
 * How a turn's images reach the chat model: as they are, as the image
 * model's reading of them, or as a note that they were left out.
 */
export type ImageReading =
  | { mode: "direct" }
  | { mode: "describe"; model: LanguageModel; key: string }
  | { mode: "none" };

/**
 * A model that sees gets the image. Any other goes through the image model
 * when one is set. Without one, a model models.dev lists as blind gets a note,
 * and one it does not list gets the image and the benefit of the doubt.
 */
export function readingFor(
  input: ImageInput | undefined,
  createModel: (connectionId: string, modelId: string) => LanguageModel,
): ImageReading {
  if (input?.sees === true) return { mode: "direct" };
  const helper = input?.helper;
  if (helper) {
    return {
      mode: "describe",
      model: createModel(helper.connectionId, helper.modelId),
      key: `${helper.connectionId}/${helper.modelId}`,
    };
  }
  return input?.sees === false ? { mode: "none" } : { mode: "direct" };
}

// Written for this app. The reading is kept and reused for every later turn,
// so it covers the whole image rather than the question asked with it.
const DESCRIBE = [
  "Another model will answer the user about this image without seeing it. It has only what you write.",
  "Describe what the image shows and how it is laid out. Transcribe all visible text exactly, keeping its structure: code as code, tables as tables. Give the values in charts and diagrams.",
  "Describe only what is there. When something is too small or unclear to make out, say so instead of guessing.",
  "Write the description and nothing else.",
].join("\n\n");

const quoted = (name: string) => name.replace(/["\n]/g, "'");

const attachment = (name: string, body: string) =>
  `<attachment name="${quoted(name)}">\n${body}\n</attachment>`;

const note = (text: string): ChatPart => ({ type: "text", text });

type Row = {
  id: string;
  name: string;
  mediaType: string;
  text: string | null;
  description: string | null;
  describedBy: string | null;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The thread's messages with each attached file as the chat model should
 * read it: a document or text file as its text, an image as `reading` says.
 * An image model's reading is saved on the upload, so the next turn reuses it.
 */
export async function withAttachments(
  db: Database,
  threadId: string,
  messages: ChatMessage[],
  reading: ImageReading,
  signal?: AbortSignal,
): Promise<ChatMessage[]> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      const id = part.type === "file" ? uploadIdOf(part.url) : null;
      if (id) ids.add(id);
    }
  }
  if (ids.size === 0) return messages;

  const rows = await db.upload.findMany({
    where: { id: { in: [...ids] }, threadId },
    select: {
      id: true,
      name: true,
      mediaType: true,
      text: true,
      description: true,
      describedBy: true,
    },
  });
  const uploads = new Map<string, Row>(rows.map((row) => [row.id, row]));
  const bytesOf = async (id: string) =>
    (await db.upload.findUniqueOrThrow({ where: { id }, select: { data: true } })).data;

  async function describe(row: Row, model: LanguageModel, key: string): Promise<string> {
    if (row.description && row.describedBy === key) return row.description;
    const { text } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: DESCRIBE },
            { type: "file", mediaType: row.mediaType, data: await bytesOf(row.id) },
          ],
        },
      ],
      abortSignal: signal,
    });
    const description = text.trim();
    if (!description) throw new Error("it returned nothing");
    await db.upload.update({
      where: { id: row.id },
      data: { description, describedBy: key },
    });
    return description;
  }

  async function resolve(part: Extract<ChatPart, { type: "file" }>): Promise<ChatPart> {
    const id = uploadIdOf(part.url);
    const row = id ? uploads.get(id) : undefined;
    const name = row?.name ?? part.filename ?? "file";
    if (!row) return note(`[The attachment "${quoted(name)}" is no longer available.]`);
    if (kindOf(row.mediaType) !== "image") return note(attachment(name, row.text ?? ""));

    if (reading.mode === "direct") {
      const data = Buffer.from(await bytesOf(row.id)).toString("base64");
      return { ...part, url: `data:${row.mediaType};base64,${data}` };
    }
    if (reading.mode === "none") {
      return note(
        `[The user attached the image "${quoted(name)}", but you cannot see images and no image model is set to read them for you. If the question depends on it, say so, and that an image model can be set in Settings, under General.]`,
      );
    }
    try {
      const description = await describe(row, reading.model, reading.key);
      return note(
        attachment(
          name,
          `[An image. You cannot see it; this is how an image model read it.]\n\n${description}`,
        ),
      );
    } catch (error) {
      console.error("image was not read:", messageOf(error));
      return note(
        `[The user attached the image "${quoted(name)}", but the image model could not read it. If the question depends on it, say so.]`,
      );
    }
  }

  return Promise.all(
    messages.map(async (message) => {
      if (message.role !== "user" || !message.parts.some((part) => part.type === "file")) {
        return message;
      }
      const parts = await Promise.all(
        message.parts.map((part) => (part.type === "file" ? resolve(part) : part)),
      );
      return { ...message, parts };
    }),
  );
}
