import { tool, type Tool } from "ai";
import { z } from "zod";
import { specPrompt } from "./catalog";
import { capabilityCheck } from "./capability-check";
import { economy } from "./economy";
import { meeting } from "./meeting";
import { review } from "./review";
import { techChoice } from "./tech-choice";
import type { Template } from "./types";

export const templates: readonly Template[] = [
  meeting,
  review,
  economy,
  techChoice,
  capabilityCheck,
];

export interface SearchOptions {
  /** Set false when no GitHub token is available: removes the review template. */
  github?: boolean;
}

export interface TemplateResult {
  template: Template;
  score: number;
}

export interface SearchOutput {
  found: boolean;
  template: Template | null;
  /** The components and how to write the spec. Not in the system prompt. */
  guide: string;
  /** Step bar detail: the template name. */
  detail: { template: string };
}

function score(template: Template, query: string): number {
  const q = query.toLowerCase();
  const words = new Set(q.split(/[^a-z0-9]+/).filter(Boolean));
  let total = 0;
  for (const term of template.terms) {
    const isAscii = /^[\x00-\x7f]+$/.test(term);
    if (isAscii && !term.includes(" ")) {
      if (words.has(term)) total += 2;
      else if (term.length > 3 && [...words].some((w) => w.startsWith(term))) total += 1;
    } else if (q.includes(term)) {
      total += term.length >= 3 ? 3 : 2;
    }
  }
  // A "owner/repo#123" or "repo ... #123" reference is a strong review signal.
  if (template.id === "review" && /[\w.-]+\/[\w.-]+\s*#?\d+|#\d+/.test(query)) total += 4;
  // Digits in the message hint at the economy template (data to lay out).
  if (template.id === "economy" && (query.match(/\d+(\.\d+)?%?/g) ?? []).length >= 3) total += 1;
  return total;
}

/** Rank templates against a query. Pure and local. */
export function rankTemplates(query: string, options: SearchOptions = {}): TemplateResult[] {
  const pool = options.github === false ? templates.filter((t) => t.id !== "review") : templates;
  return pool
    .map((template) => ({ template, score: score(template, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function searchTemplates(query: string, options: SearchOptions = {}): SearchOutput {
  const best = rankTemplates(query, options)[0];
  if (!best) return { found: false, template: null, guide: specPrompt, detail: { template: "" } };
  return {
    found: true,
    template: best.template,
    guide: specPrompt,
    detail: { template: best.template.id },
  };
}

/** AI SDK tool. Pass `{ github: false }` when no GitHub token is set. */
export function createSearchTemplatesTool(
  options: SearchOptions = {},
): Tool<{ query: string }, SearchOutput> {
  return tool({
    description:
      "Call this first, before you answer, unless the message is only a greeting or small talk. It finds a view template that lays the answer out better than prose alone. Returns what the prose says, the allowed components, how to use each, an example spec and the spec rules. If nothing fits, answer in prose.",
    inputSchema: z.object({
      query: z.string().describe("The user's request, in their own words."),
    }),
    execute: async ({ query }) => searchTemplates(query, options),
  });
}
