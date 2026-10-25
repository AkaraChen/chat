import type { Credential } from "./store";

// ChatGPT sign-in for Codex, by device code: the same client and endpoints
// as the Codex CLI and CLIProxyAPI (sdk/auth/codex_device.go). The server is
// remote, and the browser flow can only return to localhost, so the person
// enters a code at OpenAI instead and this side polls until they have.
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const USER_CODE_URL = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const DEVICE_TOKEN_URL = "https://auth.openai.com/api/accounts/deviceauth/token";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const EXCHANGE_REDIRECT_URI = "https://auth.openai.com/deviceauth/callback";
export const DEVICE_VERIFICATION_URL = "https://auth.openai.com/codex/device";
const DEFAULT_INTERVAL_S = 5;
const DEVICE_TIMEOUT_MS = 15 * 60 * 1000;

export type DeviceStart = {
  deviceAuthId: string;
  userCode: string;
  verificationUrl: string;
  intervalSeconds: number;
  expiresAt: string;
};

export type DevicePoll = { status: "pending" } | { status: "done"; credential: Credential };

export class DeviceAuthError extends Error {}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

function intervalOf(value: unknown): number {
  const seconds = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_INTERVAL_S;
}

async function failure(response: Response, what: string): Promise<DeviceAuthError> {
  const body = (await response.text().catch(() => "")).trim().slice(0, 300);
  return new DeviceAuthError(`${what} failed (${response.status})${body ? `: ${body}` : ""}`);
}

function postJson(doFetch: Fetch, url: string, body: unknown) {
  return doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
}

type Claims = {
  email?: string;
  "https://api.openai.com/auth"?: { chatgpt_account_id?: string; chatgpt_plan_type?: string };
};

/** The id token's claims. Not verified: it came straight from OpenAI over TLS. */
export function claimsOf(idToken: string): Claims {
  const payload = idToken.split(".")[1];
  if (!payload) return {};
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
  } catch {
    return {};
  }
}

export function createOpenAIDeviceAuth(options: { fetch?: Fetch; now?: () => number } = {}) {
  const doFetch: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;

  async function exchange(code: string, verifier: string): Promise<Credential> {
    const response = await doFetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code,
        redirect_uri: EXCHANGE_REDIRECT_URI,
        code_verifier: verifier,
      }).toString(),
    });
    if (!response.ok) throw await failure(response, "Signing in to OpenAI");
    const tokens = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
    };
    if (!tokens.access_token || !tokens.refresh_token || !tokens.id_token) {
      throw new DeviceAuthError("OpenAI did not return the sign-in tokens.");
    }
    const claims = claimsOf(tokens.id_token);
    const auth = claims["https://api.openai.com/auth"] ?? {};
    if (!claims.email && !auth.chatgpt_account_id) {
      throw new DeviceAuthError("OpenAI did not say which account signed in.");
    }
    return {
      type: "openai",
      method: "oauth",
      email: claims.email ?? "",
      account_id: auth.chatgpt_account_id ?? "",
      api_key: "",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token,
      plan_type: auth.chatgpt_plan_type ?? "",
      expires_at: new Date(now() + (tokens.expires_in ?? 0) * 1000).toISOString(),
    };
  }

  return {
    /** Asks OpenAI for a code the person enters at `verificationUrl`. */
    async start(): Promise<DeviceStart> {
      const response = await postJson(doFetch, USER_CODE_URL, { client_id: CLIENT_ID });
      if (response.status === 404) {
        throw new DeviceAuthError("OpenAI's device sign-in is not available right now.");
      }
      if (!response.ok) throw await failure(response, "Starting the OpenAI sign-in");
      const body = (await response.json()) as {
        device_auth_id?: string;
        user_code?: string;
        usercode?: string;
        interval?: unknown;
      };
      const userCode = (body.user_code ?? body.usercode ?? "").trim();
      const deviceAuthId = (body.device_auth_id ?? "").trim();
      if (!userCode || !deviceAuthId) {
        throw new DeviceAuthError("OpenAI did not return a sign-in code.");
      }
      return {
        deviceAuthId,
        userCode,
        verificationUrl: DEVICE_VERIFICATION_URL,
        intervalSeconds: intervalOf(body.interval),
        expiresAt: new Date(now() + DEVICE_TIMEOUT_MS).toISOString(),
      };
    },

    /** One check: pending until the person has entered the code, then the credential. */
    async poll(input: { deviceAuthId: string; userCode: string }): Promise<DevicePoll> {
      const response = await postJson(doFetch, DEVICE_TOKEN_URL, {
        device_auth_id: input.deviceAuthId,
        user_code: input.userCode,
      });
      // OpenAI answers 403 or 404 until the code has been entered.
      if (response.status === 403 || response.status === 404) return { status: "pending" };
      if (!response.ok) throw await failure(response, "Checking the OpenAI sign-in");
      const body = (await response.json()) as {
        authorization_code?: string;
        code_verifier?: string;
      };
      if (!body.authorization_code || !body.code_verifier) {
        throw new DeviceAuthError("OpenAI's sign-in reply was incomplete.");
      }
      return {
        status: "done",
        credential: await exchange(body.authorization_code, body.code_verifier),
      };
    },
  };
}

export type OpenAIDeviceAuth = ReturnType<typeof createOpenAIDeviceAuth>;
