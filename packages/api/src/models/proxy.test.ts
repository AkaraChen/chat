import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";

import { createCredentialStore, type Credential } from "../credentials/store";
import { listConnectionModels, splitModelId } from "./proxy";

function credential(overrides: Partial<Credential>): Credential {
  return {
    type: "gemini",
    method: "api_key",
    email: "",
    account_id: "",
    api_key: "sk-test",
    access_token: "",
    refresh_token: "",
    expires_at: "",
    ...overrides,
  };
}

function proxyReturning(ids: string[]) {
  const requests: { url: string; auth: string | null }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      auth: new Headers(init?.headers).get("authorization"),
    });
    return Response.json({ object: "list", data: ids.map((id) => ({ id, object: "model" })) });
  }) as typeof fetch;
  return { impl, requests };
}

describe("proxy models", () => {
  test("splits the connection prefix from the model", () => {
    expect(splitModelId("custom-ab12/deepseek/v4")).toEqual({
      connectionId: "custom-ab12",
      modelId: "deepseek/v4",
    });
    expect(splitModelId("bare")).toBeNull();
  });

  test("groups models by connection with labels and display names", async () => {
    const credentials = createCredentialStore(await mkdtemp(path.join(tmpdir(), "auths-")));
    const gemini = await credentials.save(credential({ email: "me@x.co" }));
    const custom = await credentials.save(
      credential({
        type: "custom",
        provider: "deepseek",
        base_url: "https://api.deepseek.com",
        models: [{ name: "flash", alias: "fast", display_name: "DeepSeek Flash" }],
      }),
    );
    const { impl, requests } = proxyReturning([
      `${gemini.id}/gemini-3.5-flash`,
      `${custom.id}/fast`,
      "gone-1234/whatever",
      "unprefixed",
    ]);

    const result = await listConnectionModels({
      proxyUrl: "http://127.0.0.1:8317/",
      apiKey: "internal",
      credentials,
      fetch: impl,
    });

    expect(requests).toEqual([{ url: "http://127.0.0.1:8317/v1/models", auth: "Bearer internal" }]);
    // Connections come in id order.
    expect(result).toEqual([
      {
        connectionId: custom.id,
        type: "custom",
        label: "deepseek",
        models: [{ id: "fast", name: "DeepSeek Flash" }],
      },
      {
        connectionId: gemini.id,
        type: "gemini",
        label: "me@x.co",
        models: [{ id: "gemini-3.5-flash", name: "gemini-3.5-flash" }],
      },
    ]);
  });

  test("a ChatGPT sign-in leaves out the plan's models a chat cannot use", async () => {
    const credentials = createCredentialStore(await mkdtemp(path.join(tmpdir(), "auths-")));
    const signIn = await credentials.save(
      credential({ type: "openai", method: "oauth", api_key: "", account_id: "acct-1" }),
    );
    const { impl } = proxyReturning([
      `${signIn.id}/gpt-6-sol`,
      `${signIn.id}/gpt-image-2`,
      `${signIn.id}/codex-auto-review`,
    ]);
    const result = await listConnectionModels({
      proxyUrl: "http://p",
      apiKey: "k",
      credentials,
      fetch: impl,
    });
    expect(result[0]?.models.map((m) => m.id)).toEqual(["gpt-6-sol"]);
  });

  test("omits connections the proxy lists nothing for", async () => {
    const credentials = createCredentialStore(await mkdtemp(path.join(tmpdir(), "auths-")));
    await credentials.save(credential({ email: "me@x.co" }));
    const { impl } = proxyReturning([]);
    expect(
      await listConnectionModels({ proxyUrl: "http://p", apiKey: "k", credentials, fetch: impl }),
    ).toEqual([]);
  });

  test("throws when the proxy rejects the request", async () => {
    const credentials = createCredentialStore(await mkdtemp(path.join(tmpdir(), "auths-")));
    const impl = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(
      listConnectionModels({ proxyUrl: "http://p", apiKey: "k", credentials, fetch: impl }),
    ).rejects.toThrow("401");
  });
});
