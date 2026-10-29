import { describe, expect, test } from "bun:test";

import { createOpenAIDeviceAuth, DeviceAuthError } from "./openai-device";

const jwt = (claims: object) =>
  ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "sig"].join(".");

const idToken = jwt({
  email: "me@example.com",
  "https://api.openai.com/auth": { chatgpt_account_id: "acct-9", chatgpt_plan_type: "plus" },
});

type Call = { url: string; body: string; method?: string; headers?: RequestInit["headers"] };

// A scripted OpenAI: each URL answers from its own list, in order.
function fakeOpenAI(routes: Record<string, Response[]>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      body: String(init?.body ?? ""),
      method: init?.method,
      headers: init?.headers,
    });
    const next = routes[url]?.shift();
    if (!next) throw new Error(`unexpected ${url}`);
    return next;
  };
  return { fetch, calls };
}

const USER_CODE = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const DEVICE_TOKEN = "https://auth.openai.com/api/accounts/deviceauth/token";
const TOKEN = "https://auth.openai.com/oauth/token";
const code = { deviceAuthId: "d", userCode: "u" };

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

  test("each request goes where, and as, the Codex CLI sends it", async () => {
    const { fetch, calls } = fakeOpenAI({
      [USER_CODE]: [Response.json({ device_auth_id: "dev-1", user_code: "ABCD-1234" })],
      [DEVICE_TOKEN]: [Response.json({ authorization_code: "code-1", code_verifier: "ver-1" })],
      [TOKEN]: [Response.json({ access_token: "at", refresh_token: "rt", id_token: idToken })],
    });
    const auth = createOpenAIDeviceAuth({ fetch, now: () => 0 });
    const started = await auth.start();
    expect(started.intervalSeconds).toBe(5);
    await auth.poll(started);
    const json = { "content-type": "application/json", accept: "application/json" };
    const form = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };
    expect(calls.map(({ url, method, headers }) => ({ url, method, headers }))).toEqual([
      { url: USER_CODE, method: "POST", headers: json },
      { url: DEVICE_TOKEN, method: "POST", headers: json },
      { url: TOKEN, method: "POST", headers: form },
    ]);
    expect(JSON.parse(calls[1]!.body)).toEqual({ device_auth_id: "dev-1", user_code: "ABCD-1234" });
    expect(Object.fromEntries(new URLSearchParams(calls[2]!.body))).toEqual({
      grant_type: "authorization_code",
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      code: "code-1",
      redirect_uri: "https://auth.openai.com/deviceauth/callback",
      code_verifier: "ver-1",
    });
  });

  test("odd answers from OpenAI read as before", async () => {
    const cases: [
      Record<string, Response[]>,
      (a: ReturnType<typeof createOpenAIDeviceAuth>) => Promise<unknown>,
      string,
    ][] = [
      [
        { [USER_CODE]: [new Response("", { status: 404 })] },
        (a) => a.start(),
        "OpenAI's device sign-in is not available right now.",
      ],
      [
        { [USER_CODE]: [new Response("busy", { status: 503 })] },
        (a) => a.start(),
        "Starting the OpenAI sign-in failed (503): busy",
      ],
      [
        { [USER_CODE]: [Response.json({ interval: 5 })] },
        (a) => a.start(),
        "OpenAI did not return a sign-in code.",
      ],
      [
        { [DEVICE_TOKEN]: [Response.json({ authorization_code: "c" })] },
        (a) => a.poll(code),
        "OpenAI's sign-in reply was incomplete.",
      ],
      [
        {
          [DEVICE_TOKEN]: [Response.json({ authorization_code: "c", code_verifier: "v" })],
          [TOKEN]: [new Response("bad code", { status: 400 })],
        },
        (a) => a.poll(code),
        "Signing in to OpenAI failed (400): bad code",
      ],
      [
        {
          [DEVICE_TOKEN]: [Response.json({ authorization_code: "c", code_verifier: "v" })],
          [TOKEN]: [Response.json({ access_token: "at" })],
        },
        (a) => a.poll(code),
        "OpenAI did not return the sign-in tokens.",
      ],
      [
        {
          [DEVICE_TOKEN]: [Response.json({ authorization_code: "c", code_verifier: "v" })],
          [TOKEN]: [
            Response.json({
              access_token: "at",
              refresh_token: "rt",
              id_token: jwt({ "https://api.openai.com/auth": {} }),
            }),
          ],
        },
        (a) => a.poll(code),
        "OpenAI did not say which account signed in.",
      ],
    ];
    for (const [routes, run, message] of cases) {
      const auth = createOpenAIDeviceAuth({ fetch: fakeOpenAI(routes).fetch });
      const error = await run(auth).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DeviceAuthError);
      expect((error as Error).message).toBe(message);
    }
  });

  test("not reaching OpenAI is not OpenAI's answer", async () => {
    const auth = createOpenAIDeviceAuth({
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const error = await auth.start().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(DeviceAuthError);
  });
});
