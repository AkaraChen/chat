import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveBinary } from "@cpajs/cpa/server";
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

// The server imports @cpajs/cpa/binary, which names every platform package,
// but tracing copies only their package.json. The one cpajs runs here (the
// image builds and runs on the same platform) is copied whole, for its binary.
const cpajsBinary = resolveBinary().packageName;

// here-docs reads attached documents with native engines that load their
// platform packages and OCR models by name at run time, which tracing cannot
// follow. So it is copied whole with everything it depends on, optional
// dependencies included where they are installed: Bun installs only those
// that match the machine, and the image builds and runs on the same platform.
function hereDocsPackages(): string[] {
  // Where Node would find `name` from `dir`: the nearest node_modules above it.
  const locate = (dir: string, name: string): string | null => {
    for (let at = dir; ; at = path.dirname(at)) {
      const candidate = path.join(at, "node_modules", ...name.split("/"));
      if (existsSync(path.join(candidate, "package.json"))) return realpathSync(candidate);
      if (path.dirname(at) === at) return null;
    }
  };
  let root = path.dirname(fileURLToPath(import.meta.resolve("here-docs")));
  while (!existsSync(path.join(root, "package.json"))) root = path.dirname(root);
  const found = new Map<string, string>([["here-docs", root]]);
  for (const [, dir] of found) {
    const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    const names = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ];
    for (const name of names) {
      const at = found.has(name) ? null : locate(dir, name);
      if (at) found.set(name, at);
    }
  }
  return [...found.keys()];
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
      traceDeps: [
        "react",
        "react-dom",
        "@cpajs/cpa",
        `${cpajsBinary}*`,
        ...hereDocsPackages().map((name) => `${name}*`),
      ],
      plugins: ["./src/proxy.plugin.ts"],
    }),
    viteReact(),
  ],
});
