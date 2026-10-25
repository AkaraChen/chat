import { describe, expect, test } from "bun:test";

import { claimsOf, createOpenAIDeviceAuth, DeviceAuthError } from "./openai-device";

const jwt = (claims: object) =>
  ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");

const idToken = jwt({
  email: "me@example.com",
  "https://api.openai.com/auth": { chatgpt_account_id: "acct-9", chatgpt_plan_type: "plus" },
});

type Call = { url: string; body: string };

// A scripted OpenAI: each URL answers from its own list, in order.
function fakeOpenAI(routes: Record<string, Response[]>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: String(init?.body ?? "") });
    const next = routes[url]?.shift();
    if (!next) throw new Error(`unexpected ${url}`);
    return next;
  };
  return { fetch, calls };
}

const USER_CODE = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const DEVICE_TOKEN = "https://auth.openai.com/api/accounts/deviceauth/token";
const TOKEN = "https://auth.openai.com/oauth/token";

describe("OpenAI device sign-in", () => {
  test("start returns the code to enter and where", async () => {
    const { fetch, calls } = fakeOpenAI({
      [USER_CODE]: [
        Response.json({ device_auth_id: "dev-1", user_code: "ABCD-1234", interval: "3" }),
      ],
    });
    const auth = createOpenAIDeviceAuth({ fetch, now: () => 0 });
    expect(await auth.start()).toEqual({
      deviceAuthId: "dev-1",
      userCode: "ABCD-1234",
      verificationUrl: "https://auth.openai.com/codex/device",
      intervalSeconds: 3,
      expiresAt: new Date(15 * 60 * 1000).toISOString(),
    });
    expect(JSON.parse(calls[0]!.body)).toEqual({ client_id: "app_EMoamEEZ73f0CkXaXp7hrann" });
  });

  test("poll is pending until the code is entered, then exchanges it for a credential", async () => {
    const { fetch, calls } = fakeOpenAI({
      [DEVICE_TOKEN]: [
        new Response("", { status: 403 }),
        Response.json({
          authorization_code: "code-1",
          code_verifier: "ver-1",
          code_challenge: "c",
        }),
      ],
      [TOKEN]: [
        Response.json({
          access_token: "at",
          refresh_token: "rt",
          id_token: idToken,
          expires_in: 3600,
        }),
      ],
    });
    const auth = createOpenAIDeviceAuth({ fetch, now: () => 0 });
    const input = { deviceAuthId: "dev-1", userCode: "ABCD-1234" };
    expect(await auth.poll(input)).toEqual({ status: "pending" });
    const done = await auth.poll(input);
    expect(done).toEqual({
      status: "done",
      credential: {
        type: "openai",
        method: "oauth",
        email: "me@example.com",
        account_id: "acct-9",
        api_key: "",
        access_token: "at",
        refresh_token: "rt",
        id_token: idToken,
        plan_type: "plus",
        expires_at: new Date(3600 * 1000).toISOString(),
      },
    });
    const exchange = new URLSearchParams(calls.at(-1)!.body);
    expect(exchange.get("code")).toBe("code-1");
    expect(exchange.get("code_verifier")).toBe("ver-1");
    expect(exchange.get("redirect_uri")).toBe("https://auth.openai.com/deviceauth/callback");
  });

  test("OpenAI's refusals become errors worth showing", async () => {
    const { fetch } = fakeOpenAI({
      [USER_CODE]: [new Response("", { status: 404 })],
      [DEVICE_TOKEN]: [new Response("expired", { status: 400 })],
    });
    const auth = createOpenAIDeviceAuth({ fetch });
    await expect(auth.start()).rejects.toBeInstanceOf(DeviceAuthError);
    await expect(auth.poll({ deviceAuthId: "d", userCode: "u" })).rejects.toThrow(
      "Checking the OpenAI sign-in failed (400): expired",
    );
  });

  test("claims are read from the id token, and a bad token reads as none", () => {
    expect(claimsOf(idToken).email).toBe("me@example.com");
    expect(claimsOf("not-a-jwt")).toEqual({});
  });
});
