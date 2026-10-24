import { createFileRoute, Link } from "@tanstack/react-router";

import { authClient } from "../auth-client";
import { GitHubMark } from "../components/github-mark";
import { OpenRouterIcon } from "../components/provider-icon";
import { providers } from "../components/providers";

export const Route = createFileRoute("/")({
  component: Welcome,
});

function Welcome() {
  return (
    <main className="flex h-svh">
      <img src="/welcome-landscape.jpg" alt="" className="h-full w-[560px] shrink-0 object-cover" />
      <div className="flex flex-1 flex-col items-start justify-center px-16">
        <h1 className="w-[520px] text-[44px] leading-[50px] font-semibold tracking-[-0.03em] text-[#1C1C1E]">
          Know or learn anything, or everything.
        </h1>
        <p className="mt-3.5 w-[460px] text-base leading-6 text-[#6E6E73]">
          Bring the models you already use into one calm place to chat.
        </p>
        <ul className="mt-10 flex w-[520px] gap-7">
          {providers.map(({ slug, name, Icon }) => (
            <li key={slug} className="flex flex-col items-center gap-2">
              {slug === "openrouter" ? (
                <span className="flex size-8 items-center justify-center rounded-xl bg-[#111111]">
                  <OpenRouterIcon size={20} />
                </span>
              ) : (
                <Icon size={32} className="text-[#1C1C1E]" />
              )}
              <span className="text-[13px] text-[#6E6E73]">{name}</span>
            </li>
          ))}
          <li className="flex flex-col items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[#F3F3F5] text-sm tracking-[0.2em] text-[#6E6E73]">
              ···
            </span>
            <span className="text-[13px] text-[#6E6E73]">more</span>
          </li>
        </ul>
        <button
          type="button"
          onClick={() => authClient.signIn.social({ provider: "github", callbackURL: "/chat" })}
          className="mt-9 flex h-11 items-center justify-center gap-2.5 rounded-[7px] bg-[#1C1C1E] px-5 text-sm font-medium text-white"
        >
          <GitHubMark size={16} />
          Continue with GitHub
        </button>
        <Link to="/sign-in" className="mt-3.5 text-[13px] text-[#0969DA]">
          Sign in with your account
        </Link>
      </div>
    </main>
  );
}
