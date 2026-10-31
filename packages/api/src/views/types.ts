import type { AnswerSpec, ComponentName } from "./catalog";

export const moduleIds = [
  "explain",
  "interactive",
  "compare",
  "assess",
  "data",
  "recap",
  "code",
  "widget",
] as const;

export type ModuleId = (typeof moduleIds)[number];

/**
 * A kind of view, named for what the user is trying to do. `read_me` returns
 * the modules the model asks for; see docs/generative-ui/spec.md.
 */
export interface ViewModule {
  id: ModuleId;
  /** One line for the read_me tool description: what the user wants. */
  summary: string;
  /** When to pick this module, and what the prose around the view says. */
  when: string;
  /** Phrasing on the left, what to draw on the right. Routes on the verb. */
  routes: readonly (readonly [string, string])[];
  /** Components this module may use. Sources and FollowUps are always allowed. */
  components: readonly ComponentName[];
  /** How to use each allowed component. */
  usage: Partial<Record<ComponentName, string>>;
  /** A valid spec to copy the shape from. Its content is placeholder only. */
  example?: AnswerSpec;
  /** Guidance that is not about specs, for a module drawn some other way. */
  guide?: string;
}

export const PLACEHOLDER_NOTE =
  "The example spec only shows the shape. Its names, numbers and sentences are placeholders: a real answer may use only tool results or the user's own text.";
