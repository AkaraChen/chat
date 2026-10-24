import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "../auth-client";
import { Spinner } from "../components/spinner";

export const Route = createFileRoute("/sign-up")({
  component: SignUp,
});

function SignUp() {
  const navigate = useNavigate();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await authClient.signUp.email({
      email: `${account}@users.thechat.local`,
      username: account,
      name: account,
      password,
    });
    setPending(false);
    if (result.error) {
      setError(
        result.error.code === "USERNAME_IS_ALREADY_TAKEN"
          ? "That account is already taken."
          : "Couldn't create the account. Try a longer password.",
      );
      return;
    }
    navigate({ to: "/chat" });
  }

  return (
    <main className="flex h-svh items-center justify-center">
      <form onSubmit={submit} className="flex w-[360px] flex-col gap-7">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
            Create your account
          </h1>
          <p className="text-[15px] leading-[22px] text-[#6E6E73]">
            You'll use this to sign in on the web and on your phone.
          </p>
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
            <span className="text-[13px] font-medium text-[#1C1C1E]">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
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
          {pending ? "Creating…" : "Create account"}
        </button>

        <p className="text-center text-[13px] text-[#6E6E73]">
          Already have one?{" "}
          <Link to="/sign-in" className="text-[#0969DA]">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
