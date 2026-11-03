import { detectType, type DiagramType } from "pele/core";

// A Diagram is Mermaid source that pele (https://pele.run) draws. This file
// is shared with the web app, so it only detects the type; the full parse
// runs on the server, in diagram-parse.ts, and loads every parser.

/** What each allowed type starts with. Numbers are charts, which the data module draws. */
export const diagramHeaders = {
  flowchart: "flowchart",
  sequence: "sequenceDiagram",
  state: "stateDiagram-v2",
  class: "classDiagram",
  er: "erDiagram",
} as const satisfies Partial<Record<DiagramType, string>>;

export const MAX_DIAGRAM_CHARS = 2000;

/** Why the source is not a diagram this app draws, or null. Does not parse it. */
export function diagramTypeIssue(source: string): string | null {
  const type = detectType(source);
  if (type && type in diagramHeaders) return null;
  const allowed = Object.values(diagramHeaders).join(", ");
  return type ? `${type} diagrams are not drawn here; use ${allowed}` : `start with ${allowed}`;
}

// `style`, `classDef` and `linkStyle` fix a colour, which then ignores dark
// mode and the one accent. A node keeps its class, so `A:::accent` still
// takes the app's colour for that tone.
const FIXED_COLOUR = /^\s*(style|classDef|linkStyle)\s/;

/** The source as it is drawn: without statements that fix a colour. */
export function drawable(source: string): string {
  return source
    .split("\n")
    .filter((line) => !FIXED_COLOUR.test(line))
    .join("\n");
}
