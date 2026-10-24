import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";

import { createCredentialStore, type Credential } from "../credentials/store";
import { listConnectionModels, splitModelId } from "./proxy";

function credential(overrides: Partial<Credential>): Credential {
  return {
    type: "claude",
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
    const claude = await credentials.save(credential({ email: "me@x.co" }));
    const custom = await credentials.save(
      credential({
        type: "custom",
        provider: "deepseek",
        base_url: "https://api.deepseek.com",
        models: [{ name: "flash", alias: "fast", display_name: "DeepSeek Flash" }],
      }),
    );
    const { impl, requests } = proxyReturning([
      `${claude.id}/claude-sonnet-4-5`,
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
    expect(result).toEqual([
      {
        connectionId: claude.id,
        type: "claude",
        label: "me@x.co",
        models: [{ id: "claude-sonnet-4-5", name: "claude-sonnet-4-5" }],
      },
      {
        connectionId: custom.id,
        type: "custom",
        label: "deepseek",
        models: [{ id: "fast", name: "DeepSeek Flash" }],
      },
    ]);
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
