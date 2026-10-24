import type { ComponentType, SVGProps } from "react";

import type { ProviderSlug } from "@my-better-t-app/api/credentials/store";

import { ClaudeIcon, GeminiIcon, OpenAIIcon, OpenRouterIcon } from "./provider-icon";

type MarkIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export type ProviderInfo = {
  slug: ProviderSlug;
  name: string;
  consoleUrl: string;
  keyHint: string;
  Icon: MarkIcon;
};

// The providers with a fixed brand mark, in the order the design shows them.
// `custom` takes its mark from models.dev, so it is handled on its own.
export const providers: readonly ProviderInfo[] = [
  {
    slug: "claude",
    name: "Anthropic",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-",
    Icon: ClaudeIcon,
  },
  {
    slug: "openai",
    name: "OpenAI",
    consoleUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-",
    Icon: OpenAIIcon,
  },
  {
    slug: "gemini",
    name: "Google",
    consoleUrl: "https://aistudio.google.com/apikey",
    keyHint: "",
    Icon: GeminiIcon,
  },
  {
    slug: "openrouter",
    name: "OpenRouter",
    consoleUrl: "https://openrouter.ai/keys",
    keyHint: "sk-or-",
    Icon: OpenRouterIcon,
  },
];

export function findProvider(slug: string): ProviderInfo | undefined {
  return providers.find((provider) => provider.slug === slug);
}
