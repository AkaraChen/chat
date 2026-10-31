import type { tones } from "@my-better-t-app/api/views/catalog";

export type Tone = (typeof tones)[number];

/** A box's fill and edge for each tone. Neutral sits quietly in the paper. */
export const TONE_BOX: Record<Tone, string> = {
  neutral: "border-transparent bg-recessed",
  accent: "border-accent-line bg-accent-soft",
  positive: "border-transparent bg-add-soft",
  negative: "border-transparent bg-remove-soft",
  warning: "border-warn/40 bg-warn/10",
};

/** The line or mark colour for each tone. */
export const TONE_INK: Record<Tone, string> = {
  neutral: "text-ink-secondary",
  accent: "text-accent",
  positive: "text-add",
  negative: "text-remove",
  warning: "text-warn",
};
