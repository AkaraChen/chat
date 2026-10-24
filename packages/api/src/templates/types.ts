import type { AnswerSpec, ComponentName } from "./catalog";

export interface Template {
  id: "meeting" | "review" | "economy";
  /** When to pick this template. Always says the example numbers are placeholders. */
  when: string;
  /** What the prose before the ```spec fence says. */
  prose: string;
  /** Components this template may use. */
  components: readonly ComponentName[];
  /** How to use each allowed component. */
  usage: Partial<Record<ComponentName, string>>;
  /** A valid spec to copy the shape from. Its content is placeholder only. */
  example: AnswerSpec;
  /** Retrieval terms, lowercase. Chinese terms match as substrings. */
  terms: readonly string[];
}

export const PLACEHOLDER_NOTE =
  "The example spec only shows the shape. Its names, numbers and sentences are placeholders: a real answer may use only tool results or the user's own text.";
