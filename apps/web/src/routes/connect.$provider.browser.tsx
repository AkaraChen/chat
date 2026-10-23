import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { BackLink } from "../components/back-link";
import { ProviderMark } from "../components/provider-mark";
import { findProvider } from "../components/providers";

export const Route = createFileRoute("/connect/$provider/browser")({
  loader: ({ params }) => {
    if (!findProvider(params.provider)) throw redirect({ to: "/connect" });
    return { slug: params.provider };
  },
  component: BrowserSignIn,
});

function BrowserSignIn() {
  const provider = findProvider(Route.useLoaderData().slug);
  if (!provider) return null;
  return (
    <main className="relative flex h-svh items-center justify-center">
      <BackLink to="/connect/$provider">Connection</BackLink>
      <div className="flex w-[480px] flex-col items-start">
        <span className="flex items-center gap-2.5">
          <ProviderMark slug={provider.slug} label={provider.name} />
          <span className="text-[13px] text-[#9E9EA4]">{provider.plan}</span>
        </span>
        <div className="mt-8 flex flex-col gap-2.5">
          <h1 className="text-[32px] leading-[38px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
            Finish in your browser
          </h1>
          <p className="text-[15px] leading-[22px] text-[#6E6E73]">
            Approve the sign-in for {provider.name}. This window updates on its own when you come
            back.
          </p>
        </div>
        <p className="mt-8 flex items-center gap-2.5 text-sm text-[#1C1C1E]">
          <Spinner />
          Waiting for sign-in
        </p>
        <div className="mt-7 flex flex-col items-start gap-4">
          <a
            href={provider.consoleUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center justify-center rounded-lg bg-[#1A73E8] px-4 text-sm font-medium text-white"
          >
            Open browser again
          </a>
          <Link
            to="/connect/$provider/key"
            params={{ provider: provider.slug }}
            className="text-[13px] text-[#0969DA]"
          >
            Use an API key instead
          </Link>
        </div>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="animate-spin">
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="#1A73E8"
        strokeOpacity="0.25"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="#1A73E8"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
