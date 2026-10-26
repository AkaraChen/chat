import type { ChatMessage } from "@my-better-t-app/api/chat/message";
import { DefaultChatTransport } from "ai";

export type { ChatMessage };

/**
 * useChat posts to /api/chat. The chat id is the thread id, and only the
 * newest message is sent: the server already holds the rest of the
 * conversation. The model on screen goes along, so a pick the server has not
 * saved yet still answers.
 */
export const chatTransport = new DefaultChatTransport<ChatMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ id, messages, body }) => ({
    body: { id, message: messages.at(-1), model: body?.model },
  }),
});
