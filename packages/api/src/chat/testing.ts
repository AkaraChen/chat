import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createPrismaClient, type Database } from "@my-better-t-app/db";
import { MockLanguageModelV4 } from "ai/test";

const dbDir = path.resolve(import.meta.dir, "../../../db");

// A throwaway SQLite file with the real schema, for tests only.
export async function createTestDb(): Promise<{ db: Database; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), "chat-db-"));
  const db = createPrismaClient({ DATABASE_URL: `file:${path.join(dir, "test.db")}` });
  const proc = Bun.spawn(
    [
      "bunx",
      "prisma",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      "prisma/schema",
      "--script",
    ],
    {
      cwd: dbDir,
      env: { ...process.env, DATABASE_URL: "file:/dev/null" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const sql = await new Response(proc.stdout).text();
  await proc.exited;
  const statements = sql
    .split("\n")
    .filter((line) => !line.startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) await db.$executeRawUnsafe(statement);
  return {
    db,
    async cleanup() {
      await db.$disconnect();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

type Part = Record<string, unknown>;

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function stream(parts: Part[]) {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

export const say = (text: string): Part[] => [
  { type: "stream-start", warnings: [] },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
  { type: "finish", usage, finishReason: { unified: "stop", raw: "stop" } },
];

export const callTool = (id: string, toolName: string, input: unknown, before = ""): Part[] => [
  { type: "stream-start", warnings: [] },
  ...(before
    ? [
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: before },
        { type: "text-end", id: "t" },
      ]
    : []),
  { type: "tool-call", toolCallId: id, toolName, input: JSON.stringify(input) },
  { type: "finish", usage, finishReason: { unified: "tool-calls", raw: "tool_calls" } },
];

// Plays one scripted step per model call and records what it was sent.
export function scriptedModel(steps: Part[][]) {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const parts = steps[Math.min(call++, steps.length - 1)]!;
      return { stream: stream(parts) } as never;
    },
  });
  return model;
}

export function patches(spec: { root: string; elements: Record<string, unknown> }): string {
  const lines = [JSON.stringify({ op: "add", path: "/root", value: spec.root })];
  for (const [key, value] of Object.entries(spec.elements)) {
    lines.push(JSON.stringify({ op: "add", path: `/elements/${key}`, value }));
  }
  return lines.join("\n");
}

export const notesSpec = (lead: string) => ({
  root: "answer",
  elements: {
    answer: { type: "Answer", props: { lead, source: "Fake" }, children: ["notes"] },
    notes: { type: "Notes", props: { title: "Notes", items: ["one", "two"] }, children: [] },
  },
});
