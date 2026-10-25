import { CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { ProviderSlug } from "@my-better-t-app/api/credentials/store";

import { ConnectionMark, ModelsDevMark } from "../../brand-mark";
import { findProvider, providers } from "../../providers";

export type ConnectionRow = {
  id: string;
  type: string;
  method?: "oauth" | "api_key";
  label: string;
  /** The models.dev provider id, for a custom connection. */
  provider?: string;
};
export type CatalogModel = { id: string; name: string; manual?: true };
export type CatalogEntry = { id: string; name: string; api?: string; models: CatalogModel[] };
export type SettingsCatalog = {
  openai?: CatalogEntry | null;
  gemini?: CatalogEntry | null;
  openrouter: CatalogEntry | null;
  custom: CatalogEntry[];
};

type Listed = Record<string, CatalogModel[]>;

export type SavedModel = { name: string; display_name: string; manual?: boolean };

export type SignInStart = {
  deviceAuthId: string;
  userCode: string;
  verificationUrl: string;
  intervalSeconds: number;
  expiresAt: string;
};
export type SignInPoll = { status: "pending" } | { status: "done" };

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
  | { kind: "sign-in"; target: Target }
  | { kind: "key"; target: Target }
  | { kind: "models"; connection: ConnectionRow };

const isSignIn = (connection: ConnectionRow) => connection.method === "oauth";

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ProvidersPanel({
  connections,
  catalog,
  listed,
  notice,
  onSaveKey,
  onRemove,
  onAddModel,
  onRemoveModel,
  onRefresh,
  onSignInStart,
  onSignInPoll,
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
  onRefresh: () => Promise<void>;
  onSignInStart: () => Promise<SignInStart>;
  onSignInPoll: (input: { deviceAuthId: string; userCode: string }) => Promise<SignInPoll>;
  onNotice: (message: string | null) => void;
}) {
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const known = new Set<string>(providers.map((provider) => provider.slug));
  const fixed = connections.filter((connection) => known.has(connection.type));
  const custom = connections.filter((connection) => connection.type === "custom");

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

  const keyTarget = (target: Target): Screen => ({ kind: "key", target });
  // OpenAI asks how to connect; every other provider only takes a key.
  const connectTo = (target: Target): Screen =>
    findProvider(target.slug)?.signIn ? { kind: "connect", target } : keyTarget(target);

  if (screen.kind === "pick-custom") {
    return (
      <CustomPick
        entries={catalog?.custom ?? []}
        onBack={() => setScreen({ kind: "list" })}
        onPick={(entry) =>
          setScreen(
            keyTarget({ slug: "custom", title: entry.name, providerId: entry.id, keyHint: "" }),
          )
        }
      />
    );
  }
  if (screen.kind === "connect") {
    return (
      <ConnectChoice
        target={screen.target}
        onBack={() => setScreen({ kind: "list" })}
        onSignIn={() => setScreen({ kind: "sign-in", target: screen.target })}
        onKey={() => setScreen(keyTarget(screen.target))}
      />
    );
  }
  if (screen.kind === "sign-in") {
    return (
      <SignInStep
        target={screen.target}
        onStart={onSignInStart}
        onPoll={onSignInPoll}
        onBack={() => setScreen({ kind: "connect", target: screen.target })}
        onDone={() => {
          onNotice(`${screen.target.title} is connected`);
          setScreen({ kind: "list" });
        }}
      />
    );
  }
  if (screen.kind === "key") {
    const back = connectTo(screen.target);
    return (
      <KeyStep
        target={screen.target}
        pending={pending}
        error={error}
        backLabel={back.kind === "connect" ? "Connection" : "All providers"}
        onBack={() => {
          setError(null);
          setScreen(back.kind === "connect" ? back : { kind: "list" });
        }}
        onSubmit={(apiKey) => saveKey(screen.target, apiKey)}
      />
    );
  }
  if (screen.kind === "models") {
    return (
      <ModelsStep
        connection={screen.connection}
        title={titleOf(screen.connection, catalog)}
        models={listed[screen.connection.id] ?? []}
        onBack={() => setScreen({ kind: "list" })}
        onAdd={onAddModel}
        onRemove={onRemoveModel}
        onRefresh={onRefresh}
      />
    );
  }

  // OpenAI stays on offer until it has both a sign-in and a key.
  const available = providers.filter((provider) => {
    const mine = fixed.filter((connection) => connection.type === provider.slug);
    if (mine.length === 0) return true;
    return provider.signIn === true && mine.length === 1;
  });
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[15px] text-[#6E6E73]">
        {fixed.length + custom.length > 0
          ? `${titleOf(fixed[0] ?? custom[0]!, catalog)} is on this device. Add another model any time.`
          : "Add a model to chat with. Credentials stay on the device."}
      </p>
      {fixed.length + custom.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] text-[#6E6E73]">On this device</h3>
            <RefreshButton onRefresh={onRefresh} onNotice={onNotice} />
          </div>
          <div className="overflow-hidden rounded-[12px] border border-[#E3E3E7]">
            {[...fixed, ...custom].map((connection) => (
              <ConnectedRow
                key={connection.id}
                connection={connection}
                title={titleOf(connection, catalog)}
                models={listed[connection.id]?.length}
                onOpen={
                  isSignIn(connection) ? undefined : () => setScreen({ kind: "models", connection })
                }
                onRemove={() => void onRemove(connection.id)}
              />
            ))}
          </div>
        </section>
      ) : null}
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-[#6E6E73]">Available</h3>
        <div className="overflow-hidden rounded-[12px] border border-[#E3E3E7]">
          {available.map((provider) => (
            <AvailableRow
              key={provider.slug}
              mark={<ConnectionMark type={provider.slug} size={22} />}
              title={provider.name}
              detail={provider.signIn ? "ChatGPT account or API key" : "API key"}
              onConnect={() =>
                setScreen(
                  connectTo({
                    slug: provider.slug,
                    title: provider.name,
                    consoleUrl: provider.consoleUrl,
                    keyHint: provider.keyHint,
                  }),
                )
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
          className="mx-auto flex items-center gap-2 rounded-full border border-[#E3E3E7] bg-white px-3 py-1.5 text-sm text-[#1C1C1E] shadow-sm"
        >
          <CheckIcon size={14} weight="bold" className="text-[#1A73E8]" />
          {notice}
        </p>
      ) : null}
    </div>
  );
}

// A custom connection is named after its models.dev provider.
function titleOf(connection: ConnectionRow, catalog: SettingsCatalog | null) {
  if (connection.type === "custom") {
    const id = connection.provider ?? connection.label;
    return catalog?.custom.find((entry) => entry.id === id)?.name ?? id;
  }
  return findProvider(connection.type)?.name ?? connection.label;
}

function RefreshButton({
  onRefresh,
  onNotice,
}: {
  onRefresh: () => Promise<void>;
  onNotice: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onRefresh();
          onNotice("Models are up to date");
        } catch (error) {
          onNotice(errorText(error, "Couldn't refresh the models."));
        } finally {
          setBusy(false);
        }
      }}
      className="text-[13px] font-medium text-[#1A73E8] disabled:opacity-40"
    >
      {busy ? "Refreshing…" : "Refresh models"}
    </button>
  );
}

function ConnectedRow({
  connection,
  title,
  models,
  onOpen,
  onRemove,
}: {
  connection: ConnectionRow;
  title: string;
  models?: number;
  onOpen?: () => void;
  onRemove: () => void;
}) {
  const how = isSignIn(connection) ? `ChatGPT · ${connection.label}` : "API key";
  const detail =
    models === undefined ? how : `${how} · ${models} ${models === 1 ? "model" : "models"}`;
  const text = (
    <>
      <span className="block truncate text-[15px] font-medium text-[#1C1C1E]">{title}</span>
      <span className="block truncate text-[13px] text-[#6E6E73]">{detail}</span>
    </>
  );
  return (
    <div className="flex min-h-14 items-center gap-3 border-b border-[#E3E3E7] px-4 last:border-b-0">
      <ConnectionMark
        type={connection.type}
        label={connection.provider ?? connection.label}
        size={22}
      />
      {onOpen ? (
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          {text}
        </button>
      ) : (
        <span className="min-w-0 flex-1">{text}</span>
      )}
      <span className="text-[13px] text-[#6E6E73]">Connected</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-[13px] text-[#6E6E73] hover:text-[#1C1C1E]"
      >
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
    <div className="flex min-h-14 items-center gap-3 border-b border-[#E3E3E7] px-4 last:border-b-0">
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

function TargetMark({ target }: { target: Target }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <ConnectionMark type={target.slug} label={target.providerId} size={20} />
      <span className="text-[15px] font-medium text-[#1C1C1E]">{target.title}</span>
    </div>
  );
}

function ConnectChoice({
  target,
  onBack,
  onSignIn,
  onKey,
}: {
  target: Target;
  onBack: () => void;
  onSignIn: () => void;
  onKey: () => void;
}) {
  return (
    <div>
      <Back label="All providers" onClick={onBack} />
      <TargetMark target={target} />
      <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
        Connect to {target.title}
      </h3>
      <p className="mt-1 text-[15px] text-[#6E6E73]">
        Use your ChatGPT plan, or pay per use with a key.
      </p>
      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={onSignIn}
          className="rounded-[12px] border border-[#E3E3E7] px-4 py-3 text-left"
        >
          <span className="block text-[15px] font-medium text-[#1C1C1E]">Sign in with ChatGPT</span>
          <span className="block text-[13px] text-[#6E6E73]">The models your plan includes.</span>
        </button>
        <button
          type="button"
          onClick={onKey}
          className="rounded-[12px] border border-[#E3E3E7] px-4 py-3 text-left"
        >
          <span className="block text-[15px] font-medium text-[#1C1C1E]">Use an API key</span>
          <span className="block text-[13px] text-[#6E6E73]">
            Connect through {target.title} Console
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * ChatGPT sign-in by device code: OpenAI shows a page where the code is
 * entered, and this screen checks back until it has been, then is done.
 */
function SignInStep({
  target,
  onStart,
  onPoll,
  onBack,
  onDone,
}: {
  target: Target;
  onStart: () => Promise<SignInStart>;
  onPoll: (input: { deviceAuthId: string; userCode: string }) => Promise<SignInPoll>;
  onBack: () => void;
  onDone: () => void;
}) {
  const [code, setCode] = useState<SignInStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const handlers = useRef({ onStart, onPoll, onDone });
  handlers.current = { onStart, onPoll, onDone };

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setCode(null);
    setError(null);
    async function check(started: SignInStart) {
      if (!live) return;
      if (Date.now() > Date.parse(started.expiresAt)) {
        setError("The code expired. Start again for a new one.");
        return;
      }
      try {
        const result = await handlers.current.onPoll(started);
        if (!live) return;
        if (result.status === "done") handlers.current.onDone();
        else timer = setTimeout(() => void check(started), started.intervalSeconds * 1000);
      } catch (cause) {
        if (live) setError(errorText(cause, "The sign-in did not finish."));
      }
    }
    handlers.current
      .onStart()
      .then((started) => {
        if (!live) return;
        setCode(started);
        timer = setTimeout(() => void check(started), started.intervalSeconds * 1000);
      })
      .catch((cause) => live && setError(errorText(cause, "Couldn't start the sign-in.")));
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [attempt]);

  return (
    <div>
      <Back label="Connection" onClick={onBack} />
      <TargetMark target={target} />
      <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
        Enter this code at OpenAI
      </h3>
      <p className="mt-2 max-w-[440px] text-[15px] leading-6 text-[#6E6E73]">
        Open the page, sign in to ChatGPT, and enter the code. This screen finishes on its own.
      </p>
      {code ? (
        <>
          <p
            aria-label="Sign-in code"
            className="mt-5 font-mono text-[28px] font-semibold tracking-[0.12em] text-[#1C1C1E] select-all"
          >
            {code.userCode}
          </p>
          <a
            href={code.verificationUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-[#1A73E8] px-4 text-sm font-medium text-white"
          >
            Open OpenAI
          </a>
        </>
      ) : error ? null : (
        <p className="mt-5 text-[15px] text-[#6E6E73]">Getting a code…</p>
      )}
      {error ? (
        <div className="mt-5">
          <p className="text-[13px] text-[#C2410C]">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-3 h-10 rounded-xl bg-[#1A73E8] px-4 text-sm font-medium text-white"
          >
            Start again
          </button>
        </div>
      ) : null}
      <p className="mt-4 max-w-[440px] text-[13px] leading-5 text-[#6E6E73]">
        If OpenAI says device sign-in is off, turn on device code sign-in for Codex in ChatGPT's
        security settings.
      </p>
    </div>
  );
}

function KeyStep({
  target,
  pending,
  error,
  backLabel,
  onBack,
  onSubmit,
}: {
  target: Target;
  pending: boolean;
  error: string | null;
  backLabel: string;
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
      <Back label={backLabel} onClick={onBack} />
      <TargetMark target={target} />
      <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1C1C1E]">
        Add your API key
      </h3>
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
          className="h-11 rounded-[12px] border border-[#E3E3E7] bg-white px-3 text-sm outline-none"
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
      <p className="mt-4 text-[13px] text-[#6E6E73]">
        The key is stored on this device. Its models come from models.dev.
      </p>
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
        className="mt-4 h-11 w-full rounded-[12px] border border-[#E3E3E7] bg-white px-3 text-sm outline-none"
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
  title,
  models,
  onBack,
  onAdd,
  onRemove,
  onRefresh,
}: {
  connection: ConnectionRow;
  title: string;
  models: CatalogModel[];
  onBack: () => void;
  onAdd: (input: {
    connectionId: string;
    modelId: string;
    displayName?: string;
  }) => Promise<SavedModel[] | void>;
  onRemove: (input: { connectionId: string; modelId: string }) => Promise<SavedModel[] | void>;
  onRefresh: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The proxy list lags behind a save. Keep the payload from the mutation.
  const [local, setLocal] = useState<CatalogModel[] | null>(null);
  const shown = local ?? models;

  function showSaved(saved: SavedModel[] | void) {
    if (!saved) return;
    setLocal(
      saved.map((model) => ({
        id: model.name,
        name: model.display_name || model.name,
        ...(model.manual ? { manual: true as const } : {}),
      })),
    );
  }

  return (
    <div>
      <Back label="All providers" onClick={onBack} />
      <div className="mb-3 flex items-center gap-2">
        <ConnectionMark
          type={connection.type}
          label={connection.provider ?? connection.label}
          size={20}
        />
        <span className="text-[15px] font-medium text-[#1C1C1E]">{title}</span>
      </div>
      <h3 className="text-[22px] font-semibold text-[#1C1C1E]">Models</h3>
      <p className="mt-1 max-w-[460px] text-[15px] leading-6 text-[#6E6E73]">
        Synced from models.dev twice a day. A model you add by hand stays through every sync.
      </p>
      <div className="mt-5 flex items-center justify-between">
        <h4 className="text-[13px] text-[#6E6E73]">
          {shown.length} {shown.length === 1 ? "model" : "models"}
        </h4>
        <RefreshButton
          onRefresh={async () => {
            await onRefresh();
            setLocal(null);
          }}
          onNotice={setNotice}
        />
      </div>
      <ul className="mt-2 max-h-[320px] overflow-y-auto rounded-[12px] border border-[#E3E3E7]">
        {shown.map((model) => (
          <li
            key={model.id}
            className="flex items-center gap-3 border-b border-[#E3E3E7] px-4 py-3 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-[#1C1C1E]">
                {model.name}
              </span>
              <span className="block truncate text-[13px] text-[#6E6E73]">{model.id}</span>
            </span>
            {model.manual ? (
              <button
                type="button"
                onClick={async () => {
                  showSaved(await onRemove({ connectionId: connection.id, modelId: model.id }));
                }}
                className="text-sm font-medium text-[#1A73E8]"
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-4 py-3 text-[13px] text-[#6E6E73]">
            No models yet. Refresh to sync them from models.dev.
          </li>
        ) : null}
      </ul>
      {notice ? <p className="mt-2 text-[13px] text-[#6E6E73]">{notice}</p> : null}
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
          className="mt-4 rounded-2xl border border-[#E3E3E7] bg-white p-5 shadow-xl"
        >
          <h3 id="add-model-title" className="text-[17px] font-semibold text-[#1C1C1E]">
            Add a model
          </h3>
          <p className="mt-1 text-[13px] leading-5 text-[#6E6E73]">
            For a model models.dev does not list yet. The alias is what the picker shows; the name
            is sent to {title}.
          </p>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[#1C1C1E]">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="provider/model-name"
              aria-label="Name"
              className="h-11 rounded-[12px] border border-[#E3E3E7] bg-white px-3 text-sm outline-none"
            />
          </label>
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[#1C1C1E]">Alias</span>
            <input
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="My reviewer"
              aria-label="Alias"
              className="h-11 rounded-[12px] border border-[#E3E3E7] bg-white px-3 text-sm outline-none"
            />
          </label>
          {error ? <p className="mt-2 text-[13px] text-[#C2410C]">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-9 rounded-lg border border-[#E3E3E7] px-3 text-sm"
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
