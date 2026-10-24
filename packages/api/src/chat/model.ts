import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// Builds the model for one connection. Injectable so tests never hit a network.
export type ModelFactory = (connectionId: string, modelId: string) => LanguageModel;

// Every request goes to the local proxy. It routes on `<connectionId>/<model>`.
export function createProxyModelFactory(proxy: { url: string; apiKey: string }): ModelFactory {
  const provider = createOpenAI({
    baseURL: `${proxy.url.replace(/\/+$/, "")}/v1`,
    apiKey: proxy.apiKey,
  });
  return (connectionId, modelId) => provider.chat(`${connectionId}/${modelId}`);
}
