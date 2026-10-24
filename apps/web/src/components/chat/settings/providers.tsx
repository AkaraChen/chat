import { CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { orpc } from "@/utils/orpc";

import { ConnectionMark, ModelsDevMark } from "../../brand-mark";
import { providers, type ProviderInfo } from "../../providers";
import { GithubBlock } from "./github-block";
import { KeyForm } from "./key-form";
import { ModelsBlock, type CatalogEntry } from "./models-block";
import { RowButton } from "./row";
import { useModelChoice } from "../use-model-choice";

type Connection = { id: string; type: string; label: string };

function useSaveKey(onDone?: () => void) {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.connections.saveApiKey.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.connections.list.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.models.list.key() }),
        ]);
        onDone?.();
      },
    }),
  );
}

function useRemove() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.connections.delete.mutationOptions({
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.connections.list.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.models.list.key() }),
        ]),
    }),
  );
}

function Connected() {
  return (
    <span className="flex items-center gap-1 text-[13px] font-medium text-[#1A73E8]">
      <CheckIcon size={13} weight="bold" />
      Connected
    </span>
  );
}

function Row({ mark, title, children }: { mark: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3.5">
      <span className="flex size-6 shrink-0 items-center justify-center">{mark}</span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-[#1C1C1E]">
        {title}
      </span>
      {children}
    </div>
  );
}

function ProviderRow({
  provider,
  connection,
  entry,
  listed,
}: {
  provider: ProviderInfo;
  connection: Connection | undefined;
  entry: CatalogEntry | null;
  listed: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const save = useSaveKey(() => setEditing(false));
  const remove = useRemove();
  return (
    <div className="flex flex-col">
      <Row mark={<ConnectionMark type={provider.slug} size={24} />} title={provider.name}>
        {connection ? (
          <>
            <Connected />
            <RowButton
              onClick={() => remove.mutate({ id: connection.id })}
              disabled={remove.isPending}
            >
              Remove
            </RowButton>
          </>
        ) : (
          !editing && (
            <RowButton tone="primary" onClick={() => setEditing(true)}>
              Connect
            </RowButton>
          )
        )}
      </Row>
      {editing && !connection && (
        <KeyForm
          label={`${provider.name} API key`}
          placeholder={provider.keyHint ? `${provider.keyHint}…` : "API key"}
          help={{
            href: provider.consoleUrl,
            text: `Get a key from the ${provider.name} console ↗`,
          }}
          pending={save.isPending}
          error={save.isError ? "Couldn't save the key. Try again." : null}
          onSubmit={(apiKey) => save.mutate({ type: provider.slug, apiKey })}
          onCancel={() => setEditing(false)}
        />
      )}
      {connection && provider.slug === "openrouter" && (
        <ModelsBlock connectionId={connection.id} listed={listed} entry={entry} />
      )}
    </div>
  );
}

function CustomRow({
  connection,
  entry,
  listed,
}: {
  connection: Connection;
  entry: CatalogEntry | null;
  listed: { id: string; name: string }[];
}) {
  const remove = useRemove();
  return (
    <div className="flex flex-col">
      <Row
        mark={<ModelsDevMark id={connection.label} size={24} />}
        title={entry?.name ?? connection.label}
      >
        <Connected />
        <RowButton onClick={() => remove.mutate({ id: connection.id })} disabled={remove.isPending}>
          Remove
        </RowButton>
      </Row>
      <ModelsBlock connectionId={connection.id} listed={listed} entry={entry} />
    </div>
  );
}

function AddCustom({ entries, unavailable }: { entries: CatalogEntry[]; unavailable: boolean }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<CatalogEntry | null>(null);
  const close = () => {
    setOpen(false);
    setPicked(null);
    setFilter("");
  };
  const save = useSaveKey(close);

  const shown = entries.filter((e) =>
    `${e.name} ${e.id}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col">
      <Row
        mark={
          picked ? (
            <ModelsDevMark id={picked.id} size={24} />
          ) : (
            <PlusIcon size={20} className="text-[#6E6E73]" />
          )
        }
        title={picked ? picked.name : "Custom provider"}
      >
        {!open && (
          <RowButton tone="primary" onClick={() => setOpen(true)} disabled={unavailable}>
            Connect
          </RowButton>
        )}
      </Row>
      {open && !picked && (
        <div className="flex flex-col gap-2 pb-3 pl-11">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search providers on models.dev"
            aria-label="Search providers"
            autoFocus
            className="h-10 rounded-xl bg-[#F3F3F5] px-3.5 text-sm text-[#1C1C1E] outline-none placeholder:text-[#9E9EA4] focus:ring-2 focus:ring-[#1A73E8]/40"
          />
          <ul className="max-h-56 overflow-y-auto">
            {shown.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setPicked(entry)}
                  className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-[#1C1C1E] hover:bg-[#F3F3F5]"
                >
                  <ModelsDevMark id={entry.id} size={18} />
                  <span className="truncate">{entry.name}</span>
                </button>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-2 py-2 text-[13px] text-[#6E6E73]">No provider matches.</li>
            )}
          </ul>
          <button
            type="button"
            onClick={close}
            className="self-start text-[13px] text-[#6E6E73] hover:text-[#1C1C1E]"
          >
            Cancel
          </button>
        </div>
      )}
      {open && picked && (
        <KeyForm
          label={`${picked.name} API key`}
          placeholder="API key"
          pending={save.isPending}
          error={save.isError ? "Couldn't save the key. Try again." : null}
          onSubmit={(apiKey) => save.mutate({ type: "custom", apiKey, provider: picked.id })}
          onCancel={close}
        />
      )}
    </div>
  );
}

export function ProvidersPanel() {
  const connections = useQuery(orpc.connections.list.queryOptions());
  const catalog = useQuery(
    orpc.models.catalog.queryOptions({ retry: false, meta: { quiet: true } }),
  );
  const { connections: served } = useModelChoice();

  const all = connections.data ?? [];
  const custom = all.filter((c) => c.type === "custom");
  const listedFor = (id: string) => served.find((s) => s.connectionId === id)?.models ?? [];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        {providers.map((provider) => {
          const connection = all.find((c) => c.type === provider.slug);
          return (
            <ProviderRow
              key={provider.slug}
              provider={provider}
              connection={connection}
              entry={provider.slug === "openrouter" ? (catalog.data?.openrouter ?? null) : null}
              listed={connection ? listedFor(connection.id) : []}
            />
          );
        })}
        {custom.map((connection) => (
          <CustomRow
            key={connection.id}
            connection={connection}
            entry={catalog.data?.custom.find((e) => e.id === connection.label) ?? null}
            listed={listedFor(connection.id)}
          />
        ))}
        <AddCustom entries={catalog.data?.custom ?? []} unavailable={!catalog.data} />
      </div>
      <GithubBlock />
    </div>
  );
}
