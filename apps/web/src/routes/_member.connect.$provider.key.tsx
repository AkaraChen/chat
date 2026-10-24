import { PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

import { BackLink } from "../components/back-link";
import { ProviderMark } from "../components/provider-mark";
import { findProvider, type ProviderInfo } from "../components/providers";

export const Route = createFileRoute("/_member/connect/$provider/key")({
  loader: ({ params }) => {
    if (params.provider !== "custom" && !findProvider(params.provider)) {
      throw redirect({ to: "/connect" });
    }
    return { slug: params.provider };
  },
  component: ApiKey,
});

function ApiKey() {
  const { slug } = Route.useLoaderData();
  const known = findProvider(slug);
  const provider: ProviderInfo = known ?? {
    slug: "custom",
    name: "Custom provider",
    plan: "OpenAI-compatible",
    browser: "",
    consoleUrl: "",
    keyHint: "",
    Icon: PlusIcon,
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");

  const save = useMutation(
    orpc.connections.saveApiKey.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.connections.list.key() });
        navigate({ to: "/connected", search: { provider: provider.slug } });
      },
    }),
  );

  return (
    <main className="relative flex h-svh items-center justify-center">
      {provider.slug === "custom" ? (
        <BackLink to="/connect">Providers</BackLink>
      ) : (
        <BackLink to="/connect/$provider">Connection</BackLink>
      )}
      <form
        className="flex w-[520px] flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ type: provider.slug, apiKey });
        }}
      >
        <div className="flex flex-col gap-3">
          {provider.slug !== "custom" && (
            <ProviderMark slug={provider.slug} label={provider.name} />
          )}
          <h1 className="text-[32px] leading-[38px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
            Add your API key
          </h1>
          <p className="text-[15px] leading-[22px] text-[#6E6E73]">
            {provider.slug === "custom"
              ? "Paste a key for an OpenAI-compatible endpoint."
              : `Paste a key from the ${provider.name} console to connect.`}
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <label htmlFor="api-key" className="text-[13px] font-medium text-[#1C1C1E]">
            API key
          </label>
          <input
            id="api-key"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={provider.keyHint ? `${provider.keyHint}…` : "sk-…"}
            autoComplete="off"
            spellCheck={false}
            className="mt-0.5 h-11 rounded-[7px] border border-[#D4D4D8] px-3 text-sm text-[#1C1C1E] outline-none focus:border-[#1A73E8]"
          />
          {provider.consoleUrl && (
            <a
              href={provider.consoleUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[#0969DA]"
            >
              Get an API key from the {provider.name} console ↗
            </a>
          )}
        </div>
        <button
          type="submit"
          disabled={apiKey.trim() === "" || save.isPending}
          className="flex h-10 items-center justify-center rounded-[7px] bg-[#1A73E8] text-sm font-medium text-white disabled:opacity-50"
        >
          {save.isPending ? "Connecting…" : "Connect"}
        </button>
        {save.isError && (
          <p className="text-[13px] text-[#C2410C]">Couldn't save the key. Try again.</p>
        )}
        <p className="text-xs text-[#6E6E73]">
          The key is stored on the server. Your browser keeps no copy.
        </p>
      </form>
    </main>
  );
}
