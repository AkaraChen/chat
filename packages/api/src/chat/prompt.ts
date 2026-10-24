import { inlinePrompt } from "../templates/catalog";

export function systemPrompt(options: { github: boolean }): string {
  return [
    inlinePrompt,
    "",
    "HOW TO ANSWER:",
    "- Answer in markdown. A simple question gets prose only; do not call any tool for it.",
    "- Only when the answer needs a view (meeting notes, a pull request review, figures to chart), call search_templates. It returns the components, how to write the spec and an example. Then write your prose and the ```spec fence.",
    options.github
      ? "- To read a GitHub pull request, find the GitHub tools with tool_search, then call them. Use only what they return."
      : "- No GitHub token is set, so you cannot read pull requests. If asked for a review, say so in prose.",
  ].join("\n");
}
