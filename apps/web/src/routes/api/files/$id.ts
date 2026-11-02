import { handleFileRead } from "@my-better-t-app/api/files/http";
import { createFileRoute } from "@tanstack/react-router";

import { createContext } from "../../../context";

// An attached file, for its owner or through a shared chat's link.
export const Route = createFileRoute("/api/files/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleFileRead(await createContext({ req: request }), request, params.id),
    },
  },
});
