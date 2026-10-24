import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { varlockVitePlugin } from "@varlock/vite-integration";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  server: {
    port: 3001,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    varlockVitePlugin({ ssrInjectMode: "auto-load" }),
    tailwindcss(),
    tanstackStart(),
    // Base UI reaches React through use-sync-external-store, a CommonJS
    // package whose require("react") stays a runtime require. Tracing React
    // keeps it external everywhere, so the server has one React instance.
    nitro({ preset: "node-server", traceDeps: ["react", "react-dom"] }),
    viteReact(),
  ],
});
