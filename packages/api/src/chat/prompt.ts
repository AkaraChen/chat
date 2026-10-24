import { catalogPrompt } from "../templates/catalog";

export function systemPrompt(options: { github: boolean }): string {
  return [
    catalogPrompt,
    "",
    "HOW TO ANSWER:",
    "1. First use the tools to get facts and the template: call search_templates with the user's request before anything else.",
    options.github
      ? "2. For a pull request, read it with the GitHub tools before writing. Use only what they return."
      : "2. No GitHub token is set, so you cannot read pull requests. If asked for a review, say so in the Answer and add nothing else.",
    "3. Your final message is the answer and must be SpecStream only: one JSON Patch per line, no prose, no code fences. Any text you write before calling a tool is discarded.",
  ].join("\n");
}

export function retryPrompt(errors: string[]): string {
  return [
    "The SpecStream you wrote is not a valid spec:",
    ...errors.slice(0, 12).map((e) => `- ${e}`),
    "Write the whole answer again as SpecStream only: one JSON Patch per line, no prose, no code fences. Do not call tools.",
  ].join("\n");
}
