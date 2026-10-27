import { createRequire } from "node:module";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { varlockVitePlugin } from "@varlock/vite-integration";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";

// The package a module comes from, through Bun's node_modules/.bun layout too.
function packageOf(id: string): string | null {
  const match = id.match(/.*node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/);
  return match ? match[1]!.replace("\\", "/") : null;
}

// The rest of unified, remark and rehype goes with Streamdown.
const MARKDOWN =
  /^(streamdown|@streamdown\/.*|marked|remend|unified|bail|trough|vfile.*|unist-.*|mdast-.*|micromark.*|hast-.*|hastscript|remark-.*|rehype-.*|parse5|entities|property-information|space-separated-tokens|comma-separated-tokens|html-url-attributes|html-void-elements|web-namespaces|zwitch|devlop|ccount|character-entities.*|decode-named-character-reference|markdown-table|longest-streak|estree-util-.*|style-to-.*|inline-style-parser|trim-lines|is-plain-obj|extend)$/;

// A group takes the dependencies of what it matches along with it, unless a
// group of higher priority claims them first. So the groups that reach the
// most (markdown, AI) come last, and what the shell needs comes first: Vite's
// preload helper, which every lazy import calls, and `cn()`. Without that
// they end up in the markdown chunk and the shell loads all of it.
const GROUPS: [
  name: string,
  priority: number,
  test: (id: string, pkg: string | null) => boolean,
][] = [
  ["runtime", 50, (id) => id.includes("vite/preload-helper")],
  ["react", 40, (_, pkg) => pkg === "react" || pkg === "react-dom" || pkg === "scheduler"],
  // Not the Start client: it imports the app's router, which would come along.
  [
    "tanstack",
    30,
    (_, pkg) =>
      !!pkg &&
      ((pkg.startsWith("@tanstack/") && !pkg.includes("start")) || pkg.startsWith("seroval")),
  ],
  ["cn", 30, (_, pkg) => pkg === "clsx" || pkg === "tailwind-merge"],
  [
    "base-ui",
    30,
    (_, pkg) => !!pkg && (pkg.startsWith("@base-ui/") || pkg.startsWith("@floating-ui/")),
  ],
  ["zod", 30, (_, pkg) => pkg === "zod"],
  ["json-render", 20, (_, pkg) => !!pkg && pkg.startsWith("@json-render/")],
  ["ai", 20, (_, pkg) => !!pkg && (pkg === "ai" || pkg.startsWith("@ai-sdk/"))],
  ["markdown", 10, (_, pkg) => !!pkg && MARKDOWN.test(pkg)],
];

// Browser vendor code in chunks of its own. They change only when a
// dependency does, so a deploy leaves them cached, and they download side by
// side. A group loads only with the code that imports it: the AI and markdown
// chunks still wait for a thread to open.
const vendorChunks = GROUPS.map(([name, priority, test]) => ({
  name: `vendor-${name}`,
  priority,
  test: (id: string) => test(id, packageOf(id)),
}));

// cpajs finds the CLIProxyAPI binary in a platform package it names at run
// time, which tracing cannot follow. So the server output gets cpajs and every
// platform package installed here, whole. The image builds and runs on the
// same platform, so those are the ones it needs.
function cpajsPackages(): string[] {
  const cpa = createRequire(createRequire(import.meta.url).resolve("@cpajs/cpa/package.json"));
  const { optionalDependencies = {} } = cpa("./package.json") as {
    optionalDependencies?: Record<string, string>;
  };
  const installed = Object.keys(optionalDependencies).filter((name) => {
    try {
      cpa.resolve(`${name}/package.json`);
      return true;
    } catch {
      return false;
    }
  });
  return ["@cpajs/cpa*", ...installed.map((name) => `${name}*`)];
}

export default defineConfig({
  server: {
    port: 3001,
  },
  resolve: {
    tsconfigPaths: true,
  },
  environments: {
    client: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: { groups: vendorChunks },
          },
        },
      },
    },
  },
  plugins: [
    varlockVitePlugin({ ssrInjectMode: "auto-load" }),
    tailwindcss(),
    tanstackStart(),
    // Base UI reaches React through use-sync-external-store, a CommonJS
    // package whose require("react") stays a runtime require. Tracing React
    // keeps it external everywhere, so the server has one React instance.
    nitro({
      preset: "node-server",
      traceDeps: ["react", "react-dom", ...cpajsPackages()],
      plugins: ["./src/proxy.plugin.ts"],
    }),
    viteReact(),
  ],
});
