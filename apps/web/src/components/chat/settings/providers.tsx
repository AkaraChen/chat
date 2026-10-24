import { CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import type { ProviderSlug } from "@my-better-t-app/api/credentials/store";

import { ConnectionMark, ModelsDevMark } from "../../brand-mark";
import { providers } from "../../providers";

export type ConnectionRow = { id: string; type: string; label: string };
export type CatalogModel = { id: string; name: string };
export type CatalogEntry = { id: string; name: string; api?: string; models: CatalogModel[] };
export type SettingsCatalog = { openrouter: CatalogEntry | null; custom: CatalogEntry[] };

type Listed = Record<string, CatalogModel[]>;

export type SavedModel = { name: string; display_name: string };

type Target = {
  slug: ProviderSlug;
  title: string;
  consoleUrl?: string;
  keyHint?: string;
  providerId?: string;
};

type Screen =
  | { kind: "list" }
  | { kind: "pick-custom" }
  | { kind: "connect"; target: Target }
  | { kind: "browser"; target: Target }
  | { kind: "key"; target: Target }
  | { kind: "models"; connection: ConnectionRow };

export function ProvidersPanel({
  connections,
  catalog,
  listed,
  notice,
  onSaveKey,
  onRemove,
  onAddModel,
  onRemoveModel,
  onNotice,
}: {
  connections: ConnectionRow[];
  catalog: SettingsCatalog | null;
  listed: Listed;
  notice: string | null;
  onSaveKey: (input: { type: ProviderSlug; apiKey: string; provider?: string }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onAddModel: (input: {
    connectionId: string;
    modelId: string;
    displayName?: string;
  }) => Promise<SavedModel[] | void>;
  onRemoveModel: (input: { connectionId: string; modelId: string }) => Promise<SavedModel[] | void>;
  onNotice: (message: string | null) => void;
}) {
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const known = new Set<string>(providers.map((provider) => provider.slug));
  const fixed = connections.filter((connection) => known.has(connection.type));
  const custom = connections.filter((connection) => connection.type === "custom");
  const connectedSlugs = new Set(fixed.map((connection) => connection.type));

  async function saveKey(target: Target, apiKey: string) {
    setPending(true);
    setError(null);
    try {
      await onSaveKey({
        type: target.slug,
        apiKey,
        provider: target.slug === "custom" ? target.providerId : undefined,
      });
      onNotice(`${target.title} is connected`);
      setScreen({ kind: "list" });
    } catch {
      setError("Couldn't save the key. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (screen.kind === "pick-custom") {
    return (
      <CustomPick
        entries={catalog?.custom ?? []}
        onBack={() => setScreen({ kind: "list" })}
        onPick={(entry) =>
          setScreen({
            kind: "connect",
            target: {
              slug: "custom",
              title: entry.name,
              providerId: entry.id,
              keyHint: "",
            },
          })
        }
      />
    );
  }
  if (screen.kind === "connect") {
    return (
      <ConnectChoice
        target={screen.target}
        onBack={() => setScreen({ kind: "list" })}
        onBrowser={() => setScreen({ kind: "browser", target: screen.target })}
        onKey={() => setScreen({ kind: "key", target: screen.target })}
      />
    );
  }
  if (screen.kind === "browser") {
    return (
      <BrowserWait target={screen.target} onBack={() => setScreen({ kind: "connect", target: screen.target })} />
    );
  }
  if (screen.kind === "key") {
    return (
      <KeyStep
        target={screen.target}
        pending={pending}
        error={error}
        onBack={() => setScreen({ kind: "connect", target: screen.target })}
        onSubmit={(apiKey) => saveKey(screen.target, apiKey)}
      />
    );
  }
  if (screen.kind === "models") {
    const entry =
      screen.connection.type === "openrouter"
        ? catalog?.openrouter
        : (catalog?.custom.find((item) => item.id === screen.connection.label) ?? null);
    return (
      <ModelsStep
        connection={screen.connection}
        models={listed[screen.connection.id] ?? []}
        entry={entry ?? null}
        onBack={() => setScreen({ kind: "list" })}
        onAdd={onAddModel}
        onRemove={onRemoveModel}
      />
    );
  }

  const available = providers.filter((provider) => !connectedSlugs.has(provider.slug));
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[15px] text-[#6E6E73]">
        {fixed.length + custom.length > 0
          ? `${nameOf(fixed[0] ?? custom[0]!)} is on this device. Add another model any time.`
          : "Add a model to chat with. Credentials stay on the device."}
      </p>
      {fixed.length + custom.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-[13px] text-[#6E6E73]">On this device</h3>
          <div className="overflow-hidden rounded-2xl border border-[#DCDCE0]">
            {fixed.map((connection) => (
              <ConnectedRow
                key={connection.id}
                connection={connection}
                onOpen={
                  connection.type === "openrouter"
                    ? () => setScreen({ kind: "models", connection })
                    : undefined
                }
                onRemove={() => void onRemove(connection.id)}
              />
            ))}
            {custom.map((connection) => (
              <ConnectedRow
                key={connection.id}
                connection={connection}
                title={catalog?.custom.find((entry) => entry.id === connection.label)?.name}
                onOpen={() => setScreen({ kind: "models", connection })}
                onRemove={() => void onRemove(connection.id)}
              />
            ))}
          </div>
        </section>
      ) : null}
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-[#6E6E73]">Available</h3>
        <div className="overflow-hidden rounded-2xl border border-[#DCDCE0]">
          {available.map((provider) => (
            <AvailableRow
              key={provider.slug}
              mark={<ConnectionMark type={provider.slug} size={22} />}
              title={provider.name}
              detail="API key"
              onConnect={() =>
                setScreen({
                  kind: "connect",
                  target: {
                    slug: provider.slug,
                    title: provider.name,
                    consoleUrl: provider.consoleUrl,
                    keyHint: provider.keyHint,
                  },
                })
              }
            />
          ))}
          <AvailableRow
            mark={<PlusIcon size={18} className="text-[#6E6E73]" />}
            title="Custom provider"
            detail="OpenAI-compatible"
            onConnect={() => setScreen({ kind: "pick-custom" })}
          />
        </div>
      </section>
      {notice ? (
        <p
          role="status"
          className="mx-auto flex items-center gap-2 rounded-full border border-[#DCDCE0] bg-white px-3 py-1.5 text-sm text-[#1C1C1E] shadow-sm"
        >
          <CheckIcon size={14} weight="bold" className="text-[#1A73E8]" />
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function nameOf(connection: ConnectionRow) {
  return providers.find((provider) => provider.slug === connection.type)?.name ?? connection.label;
}

function ConnectedRow({
  connection,
  title,
  onOpen,
  onRemove,
}: {
  connection: ConnectionRow;
  title?: string;
  onOpen?: () => void;
  onRemove: () => void;
}) {
  const label = title ?? nameOf(connection);
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-[#DCDCE0] px-4 last:border-b-0">
      <ConnectionMark type={connection.type} label={connection.label} size={22} />
      {onOpen ? (
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[15px] font-medium text-[#1C1C1E]">{label}</span>
          <span className="block text-[13px] text-[#6E6E73]">API key</span>
        </button>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-[#1C1C1E]">{label}</span>
          <span className="block text-[13px] text-[#6E6E73]">API key</span>
        </span>
      )}
      <span className="text-[13px] text-[#6E6E73]">Connected</span>
      <button type="button" onClick={onRemove} className="text-[13px] text-[#6E6E73] hover:text-[#1C1C1E]">
        Remove
      </button>
    </div>
  );
}

function AvailableRow({
  mark,
  title,
  detail,
  onConnect,
}: {
  mark: ReactNode;
  title: string;
  detail: string;
  onConnect: () => void;
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-[#DCDCE0] px-4 last:border-b-0">
      <span className="flex size-6 items-center justify-center">{mark}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-[#1C1C1E]">{title}</span>
        <span className="block text-[13px] text-[#6E6E73]">{detail}</span>
      </span>
      <button type="button" onClick={onConnect} className="text-sm font-medium text-[#1A73E8]">
        Connect
      </button>
    </div>
  );
}

function Back({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-4 text-sm font-medium text-[#1C1C1E]">
      ‹ {label}
    </button>
  );
}

function ConnectChoice({
  target,
  onBack,
  onBrowser,
  onKey,
}: {
  target: Target;
  onBack: () => void;
  onBrowser: () => void;
  onKey: () => void;
}) {
  return (
    <div>
      <Back label="All providers" onClick={onBack} />
      <div className="mb-4 flex items-center gap-2">
        <ConnectionMark type={target.slug} label={target.providerId} size={20} />
        <span className="text-[15px] font-medium text-[#1C1C1E]">{target.title}</span>
      </div>
      <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
        Connect to {target.title}
      </h3>
      <p className="mt-1 text-[15px] text-[#6E6E73]">Paste an API key from the provider.</p>
      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={onBrowser}
          className="rounded-2xl border border-[#DCDCE0] px-4 py-3 text-left"
        >
          <span className="block text-[15px] font-medium text-[#1C1C1E]">Sign in with your browser</span>
          <span className="block text-[13px] text-[#6E6E73]">Finish the sign-in in a browser window.</span>
        </button>
        <button type="button" onClick={onKey} className="rounded-2xl border border-[#DCDCE0] px-4 py-3 text-left">
          <span className="block text-[15px] font-medium text-[#1C1C1E]">Use an API key</span>
          <span className="block text-[13px] text-[#6E6E73]">Connect through {target.title} Console</span>
        </button>
      </div>
      <p className="mt-4 text-[13px] text-[#6E6E73]">The key is stored on this device.</p>
    </div>
  );
}

function BrowserWait({ target, onBack }: { target: Target; onBack: () => void }) {
  return (
    <div>
      <Back label="Connection" onClick={onBack} />
      <div className="mb-4 flex items-center gap-2">
        <ConnectionMark type={target.slug} label={target.providerId} size={20} />
        <span className="text-[15px] font-medium text-[#1C1C1E]">{target.title}</span>
      </div>
      <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
        Finish in your browser
      </h3>
      <p className="mt-2 max-w-[420px] text-[15px] leading-6 text-[#6E6E73]">
        Approve access in the window that opened. This screen stays here until it finishes.
      </p>
      <button
        type="button"
        className="mt-5 h-10 rounded-xl bg-[#1A73E8] px-4 text-sm font-medium text-white"
      >
        Open browser again
      </button>
      <p className="mt-4 text-[13px] text-[#6E6E73]">Nothing is saved until the provider confirms.</p>
    </div>
  );
}

function KeyStep({
  target,
  pending,
  error,
  onBack,
  onSubmit,
}: {
  target: Target;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: (apiKey: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim() && !pending) onSubmit(value.trim());
      }}
    >
      <Back label="Connection" onClick={onBack} />
      <div className="mb-4 flex items-center gap-2">
        <ConnectionMark type={target.slug} label={target.providerId} size={20} />
        <span className="text-[15px] font-medium text-[#1C1C1E]">{target.title}</span>
      </div>
      <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">Add your API key</h3>
      <p className="mt-1 text-[15px] text-[#6E6E73]">
        Paste a key from the {target.title} Console to connect.
      </p>
      <label className="mt-5 flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-[#1C1C1E]">API key</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={target.keyHint ? `${target.keyHint}…` : "API key"}
          autoComplete="off"
          spellCheck={false}
          aria-label="API key"
          className="h-11 rounded-xl border border-[#DCDCE0] bg-[#F7F7F9] px-3 text-sm outline-none"
        />
      </label>
      {target.consoleUrl ? (
        <a
          href={target.consoleUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[13px] text-[#1A73E8]"
        >
          Get an API key from {target.title} Console ↗
        </a>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-[#C2410C]">{error}</p> : null}
      <button
        type="submit"
        disabled={pending || value.trim() === ""}
        className="mt-4 h-10 rounded-xl bg-[#1A73E8] px-4 text-sm font-medium text-white disabled:opacity-40"
      >
        Connect
      </button>
      <p className="mt-4 text-[13px] text-[#6E6E73]">The key is stored on this device.</p>
    </form>
  );
}

function CustomPick({
  entries,
  onBack,
  onPick,
}: {
  entries: CatalogEntry[];
  onBack: () => void;
  onPick: (entry: CatalogEntry) => void;
}) {
  const [filter, setFilter] = useState("");
  const shown = entries.filter((entry) =>
    `${entry.name} ${entry.id}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  return (
    <div>
      <Back label="All providers" onClick={onBack} />
      <h3 className="text-[22px] font-semibold text-[#1C1C1E]">Custom provider</h3>
      <p className="mt-1 text-[15px] text-[#6E6E73]">Pick an OpenAI-compatible provider.</p>
      <input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Search providers on models.dev"
        aria-label="Search providers"
        className="mt-4 h-11 w-full rounded-xl bg-[#F7F7F9] px-3 text-sm outline-none"
      />
      <ul className="mt-2 max-h-64 overflow-y-auto">
        {shown.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onPick(entry)}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm hover:bg-[#F7F7F9]"
            >
              <ModelsDevMark id={entry.id} size={18} />
              <span className="truncate">{entry.name}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-2 py-2 text-[13px] text-[#6E6E73]">
            {entries.length === 0 ? "models.dev is unavailable right now." : "No provider matches."}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ModelsStep({
  connection,
  models,
  entry,
  onBack,
  onAdd,
  onRemove,
}: {
  connection: ConnectionRow;
  models: CatalogModel[];
  entry: CatalogEntry | null;
  onBack: () => void;
  onAdd: (input: {
    connectionId: string;
    modelId: string;
    displayName?: string;
  }) => Promise<SavedModel[] | void>;
  onRemove: (input: { connectionId: string; modelId: string }) => Promise<SavedModel[] | void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The proxy list lags behind a save. Keep the payload from the mutation.
  const [local, setLocal] = useState<CatalogModel[] | null>(null);
  const shown = local ?? models;

  function showSaved(saved: SavedModel[] | void) {
    if (!saved) return;
    setLocal(saved.map((model) => ({ id: model.name, name: model.display_name || model.name })));
  }
  const base =
    connection.type === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : (entry?.api ?? "the provider");
  const title = connection.type === "openrouter" ? "OpenRouter" : (entry?.name ?? connection.label);

  return (
    <div>
      <Back label="All providers" onClick={onBack} />
      <div className="mb-3 flex items-center gap-2">
        <ConnectionMark type={connection.type} label={connection.label} size={20} />
        <span className="text-[15px] font-medium text-[#1C1C1E]">{title}</span>
      </div>
      <h3 className="text-[22px] font-semibold text-[#1C1C1E]">Models</h3>
      <p className="mt-1 max-w-[460px] text-[15px] leading-6 text-[#6E6E73]">
        The picker shows the alias. Requests use the name. The base URL stays {base}.
      </p>
      <h4 className="mt-5 text-[13px] text-[#6E6E73]">On this device</h4>
      <ul className="mt-2 overflow-hidden rounded-2xl border border-[#DCDCE0]">
        {shown.map((model) => (
          <li
            key={model.id}
            className="flex items-center gap-3 border-b border-[#DCDCE0] px-4 py-3 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-[#1C1C1E]">{model.name}</span>
              <span className="block truncate text-[13px] text-[#6E6E73]">{model.id}</span>
            </span>
            <button
              type="button"
              onClick={async () => {
                showSaved(await onRemove({ connectionId: connection.id, modelId: model.id }));
              }}
              className="text-sm font-medium text-[#1A73E8]"
            >
              Remove
            </button>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-4 py-3 text-[13px] text-[#6E6E73]">No models on this device yet.</li>
        ) : null}
      </ul>
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-4 h-10 rounded-xl bg-[#1A73E8] px-4 text-sm font-medium text-white"
      >
        Add model
      </button>
      {adding ? (
        <div
          role="dialog"
          aria-labelledby="add-model-title"
          className="mt-4 rounded-2xl border border-[#DCDCE0] bg-white p-5 shadow-xl"
        >
          <h3 id="add-model-title" className="text-[17px] font-semibold text-[#1C1C1E]">
            Add a model
          </h3>
          <p className="mt-1 text-[13px] leading-5 text-[#6E6E73]">
            The alias is what the picker shows. The name is sent to {title}.
          </p>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[#1C1C1E]">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="anthropic/claude-sonnet"
              aria-label="Name"
              className="h-11 rounded-xl border border-[#DCDCE0] bg-[#F7F7F9] px-3 text-sm outline-none"
            />
          </label>
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[#1C1C1E]">Alias</span>
            <input
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="My reviewer"
              aria-label="Alias"
              className="h-11 rounded-xl border border-[#DCDCE0] bg-[#F7F7F9] px-3 text-sm outline-none"
            />
          </label>
          {error ? <p className="mt-2 text-[13px] text-[#C2410C]">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-9 rounded-lg border border-[#DCDCE0] px-3 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={name.trim() === ""}
              onClick={async () => {
                setError(null);
                try {
                  showSaved(
                    await onAdd({
                      connectionId: connection.id,
                      modelId: name.trim(),
                      displayName: alias.trim() || undefined,
                    }),
                  );
                  setAdding(false);
                  setName("");
                  setAlias("");
                } catch {
                  setError("Couldn't add the model. Try again.");
                }
              }}
              className="h-9 rounded-lg bg-[#1A73E8] px-3 text-sm font-medium text-white disabled:opacity-40"
            >
              Add model
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
