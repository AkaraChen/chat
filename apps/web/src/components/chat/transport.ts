import type { ChatMessage } from "@my-better-t-app/api/chat/message";
import { DefaultChatTransport } from "ai";

export type { ChatMessage };

/**
 * useChat posts to /api/chat. The chat id is the thread id, and only the
 * newest message is sent: the server already holds the rest of the
 * conversation.
 */
export const chatTransport = new DefaultChatTransport<ChatMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ id, messages }) => ({
    body: { id, message: messages.at(-1) },
  }),
});
