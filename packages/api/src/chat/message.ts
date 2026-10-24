import {
  applySpecPatch,
  SPEC_DATA_PART_TYPE,
  type Spec,
  type SpecDataPart,
} from "@json-render/core";
import type { UIMessage } from "ai";
import { z } from "zod";

import { validateSpec } from "../templates/catalog";

// Shared with the web app, so nothing here touches the database.

/** The model that wrote an assistant message. User messages have none. */
export const metadataSchema = z
  .object({ connectionId: z.string(), modelId: z.string() })
  .optional();

export type ChatMetadata = z.infer<typeof metadataSchema>;

/** `pipeJsonRender` writes one `data-spec` part per JSON Patch line. */
export const specPartSchema: z.ZodType<SpecDataPart> = z.object({
  type: z.literal("patch"),
  patch: z.looseObject({
    op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
    path: z.string(),
    value: z.unknown().optional(),
    from: z.string().optional(),
  }),
});

export const dataSchemas = { spec: specPartSchema };

/** Every tool returns `{ detail }` for the trace, next to what the model reads. */
export type ToolOutput = { detail?: Record<string, unknown> };

export type ChatMessage = UIMessage<
  ChatMetadata,
  { spec: SpecDataPart },
  Record<string, { input: unknown; output: ToolOutput }>
>;

export type ChatPart = ChatMessage["parts"][number];

const isSpecPart = (part: ChatPart): part is Extract<ChatPart, { type: "data-spec" }> =>
  part.type === SPEC_DATA_PART_TYPE;

/** The spec the message's `data-spec` parts add up to, or null when there are none. */
export function specOf(parts: readonly ChatPart[]): Spec | null {
  let spec: Spec | null = null;
  for (const part of parts) {
    if (!isSpecPart(part) || part.data.type !== "patch") continue;
    spec ??= { root: "", elements: {} };
    applySpecPatch(spec, part.data.patch as Parameters<typeof applySpecPatch>[1]);
  }
  return spec;
}

/** False when the message has a view and it does not pass the catalog. */
export function hasValidSpec(parts: readonly ChatPart[]): boolean {
  const spec = specOf(parts);
  return spec === null || validateSpec(spec).length === 0;
}

/** The message with its view dropped if the view does not pass the catalog. Prose stays. */
export function withoutInvalidSpec(message: ChatMessage): ChatMessage {
  if (hasValidSpec(message.parts)) return message;
  return { ...message, parts: message.parts.filter((part) => !isSpecPart(part)) };
}
