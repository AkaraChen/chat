import {
  CodexAbortError,
  CodexAuthError,
  CodexDeviceUnavailableError,
  CodexHttpError,
  CodexIdTokenError,
  CodexIncompleteTokensError,
  CodexNetworkError,
  type CodexAuthOptions,
  type DeviceCode,
  exchangeDeviceGrant,
  pollDeviceAuth,
  startDeviceAuth,
} from "@cpajs/codex-auth";

import type { Credential } from "./store";

// ChatGPT sign-in for Codex, by device code, through @cpajs/codex-auth (the
// same client and endpoints as the Codex CLI and CLIProxyAPI). The server is
// remote, and the browser flow can only return to localhost, so the person
// enters a code at OpenAI instead and the browser asks this side to check,
// once per call, until they have. Nothing is kept here between calls.

export type DeviceStart = DeviceCode;

export type DevicePoll = { status: "pending" } | { status: "done"; credential: Credential };

/** OpenAI refused or answered oddly; the message is worth showing. */
export class DeviceAuthError extends Error {}

const STEPS = {
  usercode: "Starting the OpenAI sign-in",
  devicetoken: "Checking the OpenAI sign-in",
  exchange: "Signing in to OpenAI",
  refresh: "Refreshing the OpenAI sign-in",
} as const;

/**
 * The package's errors in chat's words. `unexpected` is what to say when
 * OpenAI answered 2xx with something unusable. Failing to reach OpenAI is not
 * OpenAI's answer, so it stays a plain error, as before.
 */
async function step<T>(unexpected: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof CodexNetworkError || error instanceof CodexAbortError) throw error;
    if (error instanceof CodexDeviceUnavailableError) {
      throw new DeviceAuthError("OpenAI's device sign-in is not available right now.");
    }
    if (error instanceof CodexHttpError) {
      const body = error.bodyExcerpt ? `: ${error.bodyExcerpt}` : "";
      throw new DeviceAuthError(`${STEPS[error.step]} failed (${error.status})${body}`);
    }
    if (error instanceof CodexIncompleteTokensError || error instanceof CodexIdTokenError) {
      throw new DeviceAuthError(
        error.message.includes("email")
          ? "OpenAI did not say which account signed in."
          : "OpenAI did not return the sign-in tokens.",
      );
    }
    if (error instanceof CodexAuthError) throw new DeviceAuthError(unexpected);
    throw error;
  }
}

export function createOpenAIDeviceAuth(
  options: {
    fetch?: (input: string, init?: RequestInit) => Promise<Response>;
    now?: () => number;
  } = {},
) {
  const codex: CodexAuthOptions = {
    ...(options.fetch ? { fetch: options.fetch as typeof fetch } : {}),
    ...(options.now ? { now: options.now } : {}),
  };

  return {
    /** Asks OpenAI for a code the person enters at `verificationUrl`. */
    start(): Promise<DeviceStart> {
      return step("OpenAI did not return a sign-in code.", () => startDeviceAuth(codex));
    },

    /** One check: pending until the person has entered the code, then the credential. */
    async poll(input: { deviceAuthId: string; userCode: string }): Promise<DevicePoll> {
      const result = await step("OpenAI's sign-in reply was incomplete.", () =>
        pollDeviceAuth(input, codex),
      );
      if (result.status === "pending") return { status: "pending" };
      const tokens = await step("OpenAI did not return the sign-in tokens.", () =>
        exchangeDeviceGrant(result.grant, codex),
      );
      return {
        status: "done",
        credential: {
          type: "openai",
          method: "oauth",
          email: tokens.claims.email,
          account_id: tokens.claims.accountId,
          api_key: "",
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          id_token: tokens.idToken,
          plan_type: tokens.claims.planType,
          expires_at: tokens.expiresAt,
        },
      };
    },
  };
}

export type OpenAIDeviceAuth = ReturnType<typeof createOpenAIDeviceAuth>;
