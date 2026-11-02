import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { MockLanguageModelV4 } from "ai/test";

import { fileUrl, MAX_FILES } from "../files/kind";
import { createGithubStore } from "../github/store";
import type { ChatMessage } from "./message";
import {
  InvalidMessageError,
  loadMessages,
  streamChat,
  type ChatDeps,
  type ChatInput,
} from "./run";
import { chunksOf, createTestDb, say, scriptedModel } from "./testing";

let test_: Awaited<ReturnType<typeof createTestDb>>;
let github: ReturnType<typeof createGithubStore>;

beforeAll(async () => {
  test_ = await createTestDb();
  for (const id of ["u1", "u2"]) {
    await test_.db.user.create({
      data: { id, name: id, email: `${id}@x.test`, username: id, role: "user" },
    });
  }
  github = createGithubStore(path.join(await mkdtemp(path.join(tmpdir(), "gh-")), "github.json"));
});

afterAll(() => test_.cleanup());

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const newThread = (userId = "u1") => test_.db.thread.create({ data: { userId, title: "t" } });

async function upload(
  input: { name: string; mediaType: string; text?: string; data?: Uint8Array<ArrayBuffer> },
  userId = "u1",
) {
  const data = input.data ?? new TextEncoder().encode(input.text ?? "");
  return test_.db.upload.create({
    data: {
      userId,
      name: input.name,
      mediaType: input.mediaType,
      size: data.byteLength,
      data,
      text: input.text ?? null,
    },
  });
}

let ids = 0;

// What useChat sends: the files first, then the text. Name and type are the
// client's word, which the server does not take.
const withFiles = (text: string, files: { id: string }[]) => ({
  id: `m-${++ids}`,
  role: "user",
  parts: [
    ...files.map((file) => ({
      type: "file",
      mediaType: "text/html",
      filename: "lies.html",
      url: fileUrl(file.id),
    })),
    ...(text ? [{ type: "text", text }] : []),
  ],
});

function describer(reading: string) {
  return new MockLanguageModelV4({
    doGenerate: async () =>
      ({
        content: [{ type: "text", text: reading }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      }) as never,
  });
}

function deps(chat: MockLanguageModelV4, eye?: MockLanguageModelV4): ChatDeps {
  return {
    db: test_.db,
    github,
    createModel: (connectionId) => (connectionId === "vision" && eye ? eye : chat),
    titleQueue: () => ({ add: (async () => {}) as never }),
  };
}

const run = (d: ChatDeps, threadId: string, message: unknown, extra: Partial<ChatInput> = {}) =>
  streamChat(d, {
    userId: "u1",
    threadId,
    message,
    connectionId: "c1",
    modelId: "m1",
    ...extra,
  }).then(chunksOf);

type PromptPart = { type: string; text?: string; mediaType?: string };

// The user content of the last message the chat model was sent.
function lastUserContent(model: MockLanguageModelV4, call = 0): PromptPart[] {
  const prompt = model.doStreamCalls[call]!.prompt as { role: string; content: unknown }[];
  return prompt.findLast((m) => m.role === "user")!.content as PromptPart[];
}

const textOf = (parts: PromptPart[]) =>
  parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");

describe("attachments", () => {
  test("a document reaches the model as its text, and the stored message keeps the link", async () => {
    const doc = await upload({
      name: "notes.pdf",
      mediaType: "application/pdf",
      text: "# Q3\n\nUp 12%.",
    });
    const model = scriptedModel([say("Up 12%.")]);
    const thread = await newThread();
    await run(deps(model), thread.id, withFiles("Sum it up", [doc]));

    const content = lastUserContent(model);
    expect(content.some((part) => part.type === "file")).toBe(false);
    expect(textOf(content)).toContain(
      '<attachment name="notes.pdf">\n# Q3\n\nUp 12%.\n</attachment>',
    );
    expect(textOf(content)).toContain("Sum it up");

    const [user] = (await loadMessages(test_.db, thread.id)) as ChatMessage[];
    expect(user!.parts).toEqual([
      { type: "file", mediaType: "application/pdf", filename: "notes.pdf", url: fileUrl(doc.id) },
      { type: "text", text: "Sum it up" },
    ]);
    expect((await test_.db.upload.findUnique({ where: { id: doc.id } }))!.threadId).toBe(thread.id);
  });

  test("a model that sees gets the image itself, and a message can be only files", async () => {
    const image = await upload({ name: "shot.png", mediaType: "image/png", data: PNG });
    const model = scriptedModel([say("A chart.")]);
    const thread = await newThread();
    await run(deps(model), thread.id, withFiles("", [image]), { images: { sees: true } });

    const content = lastUserContent(model);
    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({ type: "file", mediaType: "image/png" });
  });

  test("a model that cannot see gets the image model's reading, read once", async () => {
    const image = await upload({ name: "shot.png", mediaType: "image/png", data: PNG });
    const eye = describer("A bar chart: Q1 3, Q2 5.");
    const model = scriptedModel([say("Q2 is higher.")]);
    const images = { sees: false, helper: { connectionId: "vision", modelId: "eye" } };
    const thread = await newThread();
    await run(deps(model, eye), thread.id, withFiles("Which is higher?", [image]), { images });

    expect(eye.doGenerateCalls).toHaveLength(1);
    const asked = eye.doGenerateCalls[0]!.prompt.at(-1)!.content as PromptPart[];
    expect(asked.some((part) => part.type === "file" && part.mediaType === "image/png")).toBe(true);
    const content = lastUserContent(model);
    expect(content.some((part) => part.type === "file")).toBe(false);
    expect(textOf(content)).toContain("A bar chart: Q1 3, Q2 5.");

    // The next turn reads the image from the history again, from what was kept.
    const next = scriptedModel([say("Yes.")]);
    await run(deps(next, eye), thread.id, withFiles("Sure?", []), { images });
    expect(eye.doGenerateCalls).toHaveLength(1);
    const history = (next.doStreamCalls[0]!.prompt as { role: string; content: unknown }[])
      .filter((m) => m.role === "user")
      .map((m) => textOf(m.content as PromptPart[]))
      .join("\n");
    expect(history).toContain("A bar chart: Q1 3, Q2 5.");
  });

  test("without an image model, a model that cannot see is told the image was left out", async () => {
    const image = await upload({ name: "shot.png", mediaType: "image/png", data: PNG });
    const model = scriptedModel([say("I can't see it.")]);
    const thread = await newThread();
    await run(deps(model), thread.id, withFiles("What is this?", [image]), {
      images: { sees: false, helper: null },
    });

    const content = lastUserContent(model);
    expect(content.some((part) => part.type === "file")).toBe(false);
    expect(textOf(content)).toContain('the image "shot.png", but you cannot see images');
  });

  test("files are the user's, stay with the thread they were sent in, and are capped", async () => {
    const model = scriptedModel([say("ok")]);
    const d = deps(model);
    const thread = await newThread();
    const theirs = await upload({ name: "x.txt", mediaType: "text/plain", text: "x" }, "u2");
    await expect(run(d, thread.id, withFiles("read", [theirs]))).rejects.toBeInstanceOf(
      InvalidMessageError,
    );
    await expect(run(d, thread.id, withFiles("read", [{ id: "nope" }]))).rejects.toBeInstanceOf(
      InvalidMessageError,
    );

    const mine = await upload({ name: "y.txt", mediaType: "text/plain", text: "y" });
    await run(d, thread.id, withFiles("read", [mine]));
    // Again in the same thread is fine; in another it is not.
    await run(d, thread.id, withFiles("again", [mine]));
    const other = await newThread();
    await expect(run(d, other.id, withFiles("read", [mine]))).rejects.toBeInstanceOf(
      InvalidMessageError,
    );

    const many = await Promise.all(
      Array.from({ length: MAX_FILES + 1 }, (_, i) =>
        upload({ name: `${i}.txt`, mediaType: "text/plain", text: "z" }),
      ),
    );
    await expect(run(d, thread.id, withFiles("all", many))).rejects.toBeInstanceOf(
      InvalidMessageError,
    );
  });

  test("with web search off, the web tools are not offered", async () => {
    const model = scriptedModel([say("From memory.")]);
    const d = deps(model);
    d.web = async () => ({ call: async () => "", close: async () => {} });
    const thread = await newThread();
    await run(d, thread.id, withFiles("news?", []), { web: false });
    const names = (model.doStreamCalls[0]!.tools ?? []).map((t) => t.name);
    expect(names).not.toContain("web_search");
    expect(names).not.toContain("web_fetch");
  });
});
