import { createSpecStreamCompiler } from "@json-render/core";
import type { Spec } from "@json-render/core";

/**
 * Compile SpecStream text (one JSON Patch per line, as streamed in a text part)
 * into a spec. Returns null until a root and at least one element exist.
 * Call it with the full text so far; it is cheap and tolerates a cut-off last line.
 */
export function compileSpecText(text: string): Spec | null {
  const compiler = createSpecStreamCompiler<Partial<Spec>>();
  compiler.push(text);
  const result = compiler.getResult();
  if (!result.root || !result.elements || !result.elements[result.root]) return null;
  return result as Spec;
}
