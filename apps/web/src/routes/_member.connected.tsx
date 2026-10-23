import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { findProvider } from "../components/providers";

const searchSchema = z.object({
  provider: z.string().catch("claude"),
});

export const Route = createFileRoute("/_member/connected")({
  validateSearch: searchSchema,
  component: Connected,
});

function Connected() {
  const { provider: slug } = Route.useSearch();
  const provider = findProvider(slug);
  const name = provider?.name ?? "Your provider";
  return (
    <main className="flex h-svh items-center justify-center">
      <div className="flex w-[480px] flex-col items-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-[#EAF6ED] text-2xl text-[#218739]">
          ✓
        </span>
        <h1 className="mt-[22px] text-[28px] leading-[34px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
          You're connected
        </h1>
        <p className="mt-2.5 text-center text-[15px] leading-[22px] text-[#6E6E73]">
          {name} is ready. Start a conversation whenever you're ready.
        </p>
        <Link
          to="/chat"
          className="mt-7 flex h-11 w-[180px] items-center justify-center rounded-[7px] bg-[#1A73E8] text-sm font-medium text-white"
        >
          Start chatting
        </Link>
        <Link to="/connect" className="mt-4 text-[13px] text-[#0969DA]">
          Add another provider
        </Link>
      </div>
    </main>
  );
}
