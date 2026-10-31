import { tool, type Tool } from "ai";
import { z } from "zod";

import { specPromptFor, type AnswerSpec, type ComponentName } from "./catalog";
import { assess } from "./modules/assess";
import { code } from "./modules/code";
import { compare } from "./modules/compare";
import { data } from "./modules/data";
import { explain } from "./modules/explain";
import { interactive } from "./modules/interactive";
import { recap } from "./modules/recap";
import { widget } from "./modules/widget";
import { sharedRules } from "./rules";
import { moduleIds, PLACEHOLDER_NOTE, type ModuleId, type ViewModule } from "./types";

export const modules: Record<ModuleId, ViewModule> = {
  explain,
  interactive,
  compare,
  assess,
  data,
  recap,
  code,
  widget,
};

/** Every module may close with these. */
const ALWAYS: readonly ComponentName[] = ["Sources", "FollowUps"];

const ALWAYS_USAGE: Partial<Record<ComponentName, string>> = {
  Sources:
    "Only sources actually read in tool results or sent by the user, one per row. Omit the element when there are none. Never invent a source.",
  FollowUps:
    "Last in the view, only when a next question is likely. Each prompt is a full question the user could have typed.",
};

export interface ReadMeOptions {
  /** Set false when no GitHub token is available: leaves out the code module. */
  github?: boolean;
}

export interface ReadMeOutput {
  /** The shared rules, each module's guidance, and the spec format. */
  guide: string;
  /** Step bar detail: the modules loaded. */
  detail: { modules: string };
}

export function availableModules(options: ReadMeOptions = {}): ModuleId[] {
  return moduleIds.filter((id) => id !== "code" || options.github !== false);
}

/** A spec as the JSONL patches the model writes: root, state, then elements from the root down. */
export function toJsonl(spec: AnswerSpec): string {
  const lines = [JSON.stringify({ op: "add", path: "/root", value: spec.root })];
  if (spec.state) lines.push(JSON.stringify({ op: "add", path: "/state", value: spec.state }));
  const seen = new Set<string>();
  const queue = [spec.root];
  while (queue.length) {
    const key = queue.shift()!;
    const element = spec.elements[key];
    if (!element || seen.has(key)) continue;
    seen.add(key);
    lines.push(JSON.stringify({ op: "add", path: `/elements/${key}`, value: element }));
    queue.push(...element.children);
  }
  return lines.join("\n");
}

function moduleGuide(module: ViewModule): string {
  const lines = [
    `## Module: ${module.id}`,
    "",
    module.when,
    "",
    "Route on what the user asks for:",
  ];
  for (const [asks, draw] of module.routes) lines.push(`- "${asks}" → ${draw}`);
  if (module.guide) lines.push("", module.guide);
  const usage = Object.entries(module.usage);
  if (usage.length) {
    lines.push("", "Components:");
    for (const [name, text] of usage) lines.push(`- ${name}: ${text}`);
  }
  if (module.example) {
    lines.push("", `Example (${PLACEHOLDER_NOTE})`, "```spec", toJsonl(module.example), "```");
  }
  return lines.join("\n");
}

/** What read_me returns for the given modules. Unknown or unavailable ones are skipped. */
export function readMe(requested: readonly string[], options: ReadMeOptions = {}): ReadMeOutput {
  const allowed = new Set<string>(availableModules(options));
  const picked = [...new Set(requested)].filter((id): id is ModuleId => allowed.has(id));
  const chosen = picked.map((id) => modules[id]);
  const components = [...new Set(chosen.flatMap((module) => module.components))];
  const specs = chosen.some((module) => module.id !== "widget");
  const sections = [sharedRules, ...chosen.map(moduleGuide)];
  if (specs) {
    sections.push(
      ["## Always available", ...ALWAYS.map((name) => `- ${name}: ${ALWAYS_USAGE[name]}`)].join(
        "\n",
      ),
      "## Writing a view\n\nWrite each view as a ```spec fence in the answer, where it belongs between the prose.\n\n" +
        specPromptFor([...components, ...ALWAYS]),
    );
  }
  if (chosen.length === 0) {
    sections.push("No module matched. Answer in prose.");
  }
  return { guide: sections.join("\n\n"), detail: { modules: picked.join(", ") } };
}

/** AI SDK tool. Pass `{ github: false }` when no GitHub token is set. */
export function createReadMeTool(
  options: ReadMeOptions = {},
): Tool<{ modules: ModuleId[] }, ReadMeOutput> {
  const ids = availableModules(options);
  const list = ids.map((id) => `- ${id}: the user wants to ${modules[id].summary}`).join("\n");
  return tool({
    description: `Call this before you answer, unless the message is small talk or the answer is a sentence or two of plain prose. It returns how to lay the answer out: the shared rules, the guidance for the modules you name, and the view format with only the components those modules use. Pick modules by what the user wants to do (the verb), not by the topic. Name more than one when the answer needs two kinds of view.\n\n${list}`,
    inputSchema: z.object({
      modules: z
        .array(z.enum(ids as [ModuleId, ...ModuleId[]]))
        .min(1)
        .max(3)
        .describe("The modules to load, most important first."),
    }),
    execute: async ({ modules: requested }) => readMe(requested, options),
  });
}

/** True when read_me loaded the widget module in one of these steps. */
export function loadedWidget(
  steps: readonly { toolCalls: readonly { toolName: string; input: unknown }[] }[],
): boolean {
  return steps.some((step) =>
    step.toolCalls.some(
      (call) =>
        call.toolName === "read_me" &&
        Array.isArray((call.input as { modules?: unknown }).modules) &&
        (call.input as { modules: unknown[] }).modules.includes("widget"),
    ),
  );
}
