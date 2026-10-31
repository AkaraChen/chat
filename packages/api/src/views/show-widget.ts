import { tool, type Tool } from "ai";
import { z } from "zod";

/** Longest widget fragment accepted, in characters. */
export const MAX_WIDGET_CHARS = 60_000;

export const widgetInputSchema = z.object({
  title: z.string().min(1).max(80).describe("A few words naming what the widget shows."),
  html: z
    .string()
    .min(1)
    .max(MAX_WIDGET_CHARS)
    .describe(
      "The HTML fragment: a short <style>, then the content (HTML or inline SVG), then <script>.",
    ),
});

export type WidgetInput = z.infer<typeof widgetInputSchema>;

export interface ShowWidgetOutput {
  shown: true;
  detail: { title: string };
}

/**
 * Draws an HTML/SVG fragment in a sandboxed frame. The app renders it from
 * the tool input as it streams; the result only tells the model it was shown.
 * Offered only after read_me has loaded the widget module.
 */
export function createShowWidgetTool(): Tool<WidgetInput, ShowWidgetOutput> {
  return tool({
    description:
      "Draw an HTML/SVG widget inline in the answer, following the widget module of read_me. Write the prose that explains it outside this call.",
    inputSchema: widgetInputSchema,
    execute: async ({ title }) => ({ shown: true, detail: { title } }),
  });
}
