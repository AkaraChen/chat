import { createFileRoute, Link } from "@tanstack/react-router";

import { OpenRouterIcon } from "../components/provider-icon";
import { providers } from "../components/providers";

export const Route = createFileRoute("/_member/connect/")({
  component: Connect,
});

function Connect() {
  return (
    <main className="flex h-svh items-center justify-center">
      <div className="flex w-[560px] flex-col gap-7">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
            Connect a model
          </h1>
          <p className="text-[15px] leading-[22px] text-[#6E6E73]">
            Choose a provider to start chatting. You can add more any time.
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {providers.map(({ slug, name, plan, Icon }) => (
            <li key={slug}>
              <Link
                to="/connect/$provider"
                params={{ provider: slug }}
                className="flex h-14 items-center gap-3.5 rounded-[10px] px-1"
              >
                {slug === "openrouter" ? (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#111111]">
                    <OpenRouterIcon size={20} />
                  </span>
                ) : (
                  <Icon size={28} className="shrink-0 text-[#1C1C1E]" />
                )}
                <span className="flex-1 text-[15px] font-medium text-[#1C1C1E]">{name}</span>
                <span className="text-[13px] text-[#6E6E73]">{plan}</span>
                <Chevron />
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/connect/$provider/key"
              params={{ provider: "custom" }}
              className="flex h-14 items-center gap-3.5 rounded-[10px] px-1"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#F3F3F5] text-lg text-[#6E6E73]">
                +
              </span>
              <span className="flex-1 text-[15px] font-medium text-[#1C1C1E]">Custom provider</span>
              <span className="text-[13px] text-[#6E6E73]">OpenAI-compatible</span>
              <Chevron />
            </Link>
          </li>
        </ul>
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#6E6E73]">Credentials are stored on the server.</p>
          <Link to="/chat" className="text-[13px] text-[#0969DA]">
            Set up later
          </Link>
        </div>
      </div>
    </main>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none">
      <path
        d="M5.5 3 9.5 7l-4 4"
        stroke="#9E9EA4"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
