import { handleFileUpload } from "@my-better-t-app/api/files/http";
import { createFileRoute } from "@tanstack/react-router";

import { createContext } from "../../../context";

// Attaching a file. Not oRPC: the body is a multipart form, checked for size
// before it is read.
export const Route = createFileRoute("/api/files/")({
  server: {
    handlers: {
      POST: async ({ request }) => handleFileUpload(await createContext({ req: request }), request),
    },
  },
});
