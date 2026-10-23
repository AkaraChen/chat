import type { ComponentType, SVGProps } from "react";

import type { ProviderSlug } from "@my-better-t-app/api/credentials/store";

import { ClaudeIcon, GeminiIcon, OpenAIIcon, OpenRouterIcon } from "./provider-icon";

type MarkIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export type ProviderInfo = {
  slug: ProviderSlug;
  name: string;
  plan: string;
  browser: string;
  consoleUrl: string;
  keyHint: string;
  Icon: MarkIcon;
};

// The providers the design shows, in that order. `custom` has no brand mark
// and no browser sign-in, so it is handled on its own where it appears.
export const providers: readonly ProviderInfo[] = [
  {
    slug: "claude",
    name: "Anthropic",
    plan: "Claude Pro / Max",
    browser: "Use your Claude Pro or Max plan",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-",
    Icon: ClaudeIcon,
  },
  {
    slug: "openai",
    name: "OpenAI",
    plan: "ChatGPT Plus / Team",
    browser: "Use your ChatGPT Plus or Team plan",
    consoleUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-",
    Icon: OpenAIIcon,
  },
  {
    slug: "gemini",
    name: "Google",
    plan: "Gemini",
    browser: "Use your Google account",
    consoleUrl: "https://aistudio.google.com/apikey",
    keyHint: "",
    Icon: GeminiIcon,
  },
  {
    slug: "openrouter",
    name: "OpenRouter",
    plan: "API key",
    browser: "Use your OpenRouter account",
    consoleUrl: "https://openrouter.ai/keys",
    keyHint: "sk-or-",
    Icon: OpenRouterIcon,
  },
];

export function findProvider(slug: string): ProviderInfo | undefined {
  return providers.find((provider) => provider.slug === slug);
}
