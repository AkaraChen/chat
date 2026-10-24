import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { BackLink } from "../components/back-link";
import { ProviderMark } from "../components/provider-mark";
import { findProvider } from "../components/providers";

export const Route = createFileRoute("/_member/connect/$provider/")({
  loader: ({ params }) => {
    if (!findProvider(params.provider)) throw redirect({ to: "/connect" });
    return { slug: params.provider };
  },
  component: AuthMethod,
});

function AuthMethod() {
  const provider = findProvider(Route.useLoaderData().slug);
  if (!provider) return null;
  return (
    <main className="relative flex h-svh items-center justify-center">
      <BackLink to="/connect">Providers</BackLink>
      <div className="flex w-[520px] flex-col gap-7">
        <div className="flex flex-col gap-3">
          <ProviderMark slug={provider.slug} label={provider.name} />
          <h1 className="text-[32px] leading-[38px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
            Connect to {provider.name}
          </h1>
          <p className="text-[15px] leading-[22px] text-[#6E6E73]">
            Choose how you'd like to connect your account.
          </p>
        </div>
        <div className="flex flex-col gap-3.5">
          <Link
            to="/connect/$provider/browser"
            params={{ provider: provider.slug }}
            className="flex flex-col gap-1.5 rounded-[10px] border border-[#E4E4E7] px-4 py-[15px]"
          >
            <span className="text-[15px] font-medium text-[#1C1C1E]">
              Sign in with your browser
            </span>
            <span className="text-[13px] text-[#6E6E73]">{provider.browser}</span>
          </Link>
          <Link
            to="/connect/$provider/key"
            params={{ provider: provider.slug }}
            className="flex flex-col gap-1.5 rounded-[10px] border border-[#E4E4E7] px-4 py-[15px]"
          >
            <span className="text-[15px] font-medium text-[#1C1C1E]">Use an API key</span>
            <span className="text-[13px] text-[#6E6E73]">
              Connect through the {provider.name} console
            </span>
          </Link>
        </div>
        <p className="text-xs text-[#6E6E73]">
          Credentials are stored on the server. Your browser keeps no copy.
        </p>
      </div>
    </main>
  );
}
