import { tool, type Tool } from "ai";
import { z } from "zod";
import { economy } from "./economy";
import { meeting } from "./meeting";
import { review } from "./review";
import type { Template } from "./types";

export const templates: readonly Template[] = [meeting, review, economy];

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
  if (!best) return { found: false, template: null, detail: { template: "" } };
  return { found: true, template: best.template, detail: { template: best.template.id } };
}

/** AI SDK tool. Pass `{ github: false }` when no GitHub token is set. */
export function createSearchTemplatesTool(
  options: SearchOptions = {},
): Tool<{ query: string }, SearchOutput> {
  return tool({
    description:
      "Find the json-render template that fits the request. Returns when to use it, the allowed components, how to use each, and an example spec. Call this before writing the answer.",
    inputSchema: z.object({
      query: z.string().describe("The user's request, in their own words."),
    }),
    execute: async ({ query }) => searchTemplates(query, options),
  });
}
