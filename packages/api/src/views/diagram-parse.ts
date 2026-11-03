import { parse, PeleError } from "pele";

import { drawable, MAX_DIAGRAM_CHARS } from "./diagram";

/**
 * Why pele cannot draw this source, or null. Server only: importing it loads
 * every Mermaid parser, which the web app fetches one type at a time instead.
 */
export function parseDiagram(source: string): string | null {
  try {
    parse(drawable(source), { limit: MAX_DIAGRAM_CHARS });
    return null;
  } catch (error) {
    if (error instanceof PeleError) return error.message;
    throw error;
  }
}
