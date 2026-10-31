import {
  applySpecPatch,
  SPEC_DATA_PART_TYPE,
  type Spec,
  type SpecDataPart,
} from "@json-render/core";
import type { UIMessage } from "ai";
import { z } from "zod";

import { validateSpec } from "../views/catalog";

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

/** One view in a message: its spec, and the indexes of the parts that built it. */
export type View = { spec: Spec; parts: number[] };

/**
 * The views the message's `data-spec` parts add up to, in order. Each view
 * starts by setting `/root`; a second `/root` starts the next view.
 */
export function viewsOf(parts: readonly ChatPart[]): View[] {
  const views: View[] = [];
  let current: View | null = null;
  for (const [index, part] of parts.entries()) {
    if (!isSpecPart(part) || part.data.type !== "patch") continue;
    const patch = part.data.patch;
    if (current && patch.path === "/root" && current.spec.root) current = null;
    if (!current) {
      current = { spec: { root: "", elements: {} }, parts: [] };
      views.push(current);
    }
    applySpecPatch(current.spec, patch as Parameters<typeof applySpecPatch>[1]);
    current.parts.push(index);
  }
  return views;
}

/** False when the message has a view that does not pass the catalog. */
export function hasValidSpec(parts: readonly ChatPart[]): boolean {
  return viewsOf(parts).every((view) => validateSpec(view.spec).length === 0);
}

/** The message without the views that do not pass the catalog. Prose and valid views stay. */
export function withoutInvalidSpec(message: ChatMessage): ChatMessage {
  const dropped = new Set<number>();
  for (const view of viewsOf(message.parts)) {
    if (validateSpec(view.spec).length > 0) view.parts.forEach((index) => dropped.add(index));
  }
  if (dropped.size === 0) return message;
  return { ...message, parts: message.parts.filter((_, index) => !dropped.has(index)) };
}
