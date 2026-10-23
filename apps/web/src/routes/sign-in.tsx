import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "../auth-client";
import { GitHubMark } from "../components/github-mark";
import { Spinner } from "../components/spinner";

export const Route = createFileRoute("/sign-in")({
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await authClient.signIn.username({ username: account, password });
    setPending(false);
    if (result.error) {
      setError("That account or password isn't right.");
      return;
    }
    // A member goes on to set up the providers. The gate sends a visitor back
    // to the public pages.
    navigate({ to: "/connect" });
  }

  return (
    <main className="flex h-svh items-center justify-center">
      <form onSubmit={submit} className="flex w-[360px] flex-col gap-7">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
            Sign in
          </h1>
          <p className="text-[15px] leading-[22px] text-[#6E6E73]">
            One account, on every device you open The Chat.
          </p>
        </div>

        <button
          type="button"
          onClick={() => authClient.signIn.social({ provider: "github", callbackURL: "/connect" })}
          className="flex h-11 items-center justify-center gap-2.5 rounded-[7px] bg-[#1C1C1E] text-sm font-medium text-white"
        >
          <GitHubMark />
          Continue with GitHub
        </button>

        <div className="flex items-center gap-3.5">
          <span className="h-px flex-1 bg-[#E4E4E7]" />
          <span className="text-xs text-[#9E9EA4]">or</span>
          <span className="h-px flex-1 bg-[#E4E4E7]" />
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-[#1C1C1E]">Account</span>
            <input
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              placeholder="Your account"
              autoComplete="username"
              className="h-11 rounded-[7px] border border-[#B4B4BA] px-3 text-sm text-[#1C1C1E] outline-none placeholder:text-[#9E9EA4] focus:border-[#1A73E8]"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-[#1C1C1E]">Password</span>
              <Link to="/sign-in" className="text-xs text-[#0969DA]">
                Forgot?
              </Link>
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="h-11 rounded-[7px] border border-[#B4B4BA] px-3 text-sm text-[#1C1C1E] outline-none focus:border-[#1A73E8]"
            />
          </label>
        </div>

        {error && <p className="text-[13px] text-[#C2410C]">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="flex h-11 items-center justify-center gap-2 rounded-[7px] bg-[#1A73E8] text-sm font-medium text-white disabled:opacity-50"
        >
          {pending && <Spinner size={14} light />}
          {pending ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-center text-[13px] text-[#6E6E73]">
          No account yet?{" "}
          <Link to="/sign-up" className="text-[#0969DA]">
            Create one
          </Link>
        </p>
      </form>
    </main>
  );
}
