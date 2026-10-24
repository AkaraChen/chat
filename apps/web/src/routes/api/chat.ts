import { handleChatRequest } from "@my-better-t-app/api/chat/http";
import { createFileRoute } from "@tanstack/react-router";

import { createContext } from "../../context";

// The answer stream. Not oRPC: useChat reads an AI SDK UI message stream.
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        handleChatRequest(await createContext({ req: request }), request),
    },
  },
});
