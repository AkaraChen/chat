// Starts the model proxy when the production server boots. In development
// Vite serves requests without the Nitro runtime, so context.ts starts it.
import { definePlugin } from "nitro";

import { ensureProxy } from "./proxy.server";

export default definePlugin(() => {
  void ensureProxy();
});
