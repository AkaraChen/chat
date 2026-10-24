import { eventIteratorToUnproxiedDataStream } from "@orpc/client";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

import { client } from "@/utils/orpc";

/**
 * What the server streams besides text and tool parts: `spec` is the final
 * validated spec, `spec-reset` means the text so far was not the answer.
 */
export type ChatMessage = UIMessage<
  unknown,
  { spec: unknown; "spec-reset": Record<string, never> },
  Record<string, { input: unknown; output: { detail?: Record<string, unknown> } }>
>;

function textOf(message: ChatMessage | undefined): string {
  if (!message) return "";
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

/**
 * useChat talks to the oRPC `chat.send` procedure instead of an HTTP route.
 * The chat id is the thread id, and only the newest user message is sent: the
 * server already holds the rest of the conversation.
 */
export const chatTransport: ChatTransport<ChatMessage> = {
  async sendMessages({ chatId, messages, abortSignal }) {
    const text = textOf([...messages].reverse().find((message) => message.role === "user"));
    const events = await client.chat.send({ threadId: chatId, text }, { signal: abortSignal });
    return eventIteratorToUnproxiedDataStream(events) as ReadableStream<UIMessageChunk>;
  },
  // Streams are not resumable; a reload shows the persisted message instead.
  async reconnectToStream() {
    return null;
  },
};
