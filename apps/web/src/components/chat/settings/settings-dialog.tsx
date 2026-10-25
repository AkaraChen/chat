import { EyeIcon, PlugsIcon, SlidersHorizontalIcon, XIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";

import type { ProviderSlug } from "@my-better-t-app/api/credentials/store";

import { orpc } from "@/utils/orpc";

import { GitHubMark } from "../../github-mark";
import { GeneralPanel } from "./general";
import { GithubPanel } from "./github-panel";
import {
  ProvidersPanel,
  type CatalogModel,
  type ConnectionRow,
  type SavedModel,
  type SettingsCatalog,
  type SignInPoll,
  type SignInStart,
} from "./providers";
import type { SettingsTab } from "./tabs";

export type { SettingsTab };

const tabs: { id: SettingsTab; Icon: ComponentType<{ size?: number }> | null }[] = [
  { id: "general", Icon: SlidersHorizontalIcon },
  { id: "providers", Icon: PlugsIcon },
  { id: "appearance", Icon: EyeIcon },
  { id: "github", Icon: null },
];

export type SettingsData = {
  connections: ConnectionRow[];
  catalog: SettingsCatalog | null;
  listed: Record<string, CatalogModel[]>;
  githubSet: boolean;
};

export type SettingsHandlers = {
  onSaveKey?: (input: { type: ProviderSlug; apiKey: string; provider?: string }) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
  onAddModel?: (input: {
    connectionId: string;
    modelId: string;
    displayName?: string;
  }) => Promise<SavedModel[] | void>;
  onRemoveModel?: (input: {
    connectionId: string;
    modelId: string;
  }) => Promise<SavedModel[] | void>;
  onRefresh?: () => Promise<void>;
  onSignInStart?: () => Promise<SignInStart>;
  onSignInPoll?: (input: { deviceAuthId: string; userCode: string }) => Promise<SignInPoll>;
  onSaveToken?: (token: string) => Promise<void>;
  onClearToken?: () => Promise<void>;
};

function useLiveSettings(enabled: boolean): SettingsData {
  const connections = useQuery({ ...orpc.connections.list.queryOptions(), enabled });
  const catalog = useQuery({
    ...orpc.models.catalog.queryOptions(),
    enabled,
    retry: false,
    meta: { quiet: true },
  });
  const models = useQuery({
    ...orpc.models.list.queryOptions(),
    enabled,
    retry: false,
    meta: { quiet: true },
  });
  const github = useQuery({
    ...orpc.github.get.queryOptions(),
    enabled,
    meta: { quiet: true },
  });
  const listed: SettingsData["listed"] = {};
  for (const connection of models.data?.connections ?? []) {
    listed[connection.connectionId] = connection.models;
  }
  return {
    connections: connections.data ?? [],
    catalog: catalog.data ?? null,
    listed,
    githubSet: github.data?.set === true,
  };
}

export function SettingsDialog({
  tab,
  name,
  email,
  onTab,
  onClose,
  data,
  handlers,
}: {
  tab: SettingsTab | undefined;
  name: string;
  email: string;
  onTab: (tab: SettingsTab) => void;
  onClose: () => void;
  data?: SettingsData;
  handlers?: SettingsHandlers;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [modelOverrides, setModelOverrides] = useState<SettingsData["listed"]>({});
  const live = useLiveSettings(data === undefined && tab !== undefined);
  const resolved = data ?? live;
  const listed = { ...resolved.listed, ...modelOverrides };
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.connections.list.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.models.list.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.github.get.key() }),
    ]);
  // models.list is the proxy catalog. It reloads after auths/ changes, and a
  // refetch can stay empty for the whole stale window. The mutation payload is
  // the saved list, so show that instead of waiting.
  function rememberModels(connectionId: string, models: SavedModel[]) {
    const items: CatalogModel[] = models.map((model) => ({
      id: model.name,
      name: model.display_name || model.name,
      ...(model.manual ? { manual: true as const } : {}),
    }));
    setModelOverrides((current) => ({ ...current, [connectionId]: items }));
    queryClient.setQueryData(orpc.models.list.queryKey(), (current) => {
      const data = (current ?? {}) as {
        connections?: {
          connectionId: string;
          type: string;
          label: string;
          models: { id: string; name: string }[];
        }[];
        choice?: { connectionId: string; modelId: string; available: boolean } | null;
      };
      const connections = data.connections ?? [];
      const next = connections.some((item) => item.connectionId === connectionId)
        ? connections.map((item) =>
            item.connectionId === connectionId ? { ...item, models: items } : item,
          )
        : [
            ...connections,
            { connectionId, type: "openrouter", label: connectionId, models: items },
          ];
      return { ...data, connections: next, choice: data.choice ?? null } as NonNullable<
        typeof current
      >;
    });
  }
  const saveKey = useMutation(orpc.connections.saveApiKey.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(orpc.connections.delete.mutationOptions({ onSuccess: refresh }));
  const addModel = useMutation(orpc.models.create.mutationOptions());
  const removeModel = useMutation(orpc.models.delete.mutationOptions());
  const refreshModels = useMutation(
    orpc.models.refresh.mutationOptions({
      onSuccess: () => {
        // What the sync wrote replaces what a save showed early.
        setModelOverrides({});
        return refresh();
      },
    }),
  );
  const signInStart = useMutation(orpc.connections.openaiSignIn.start.mutationOptions());
  const signInPoll = useMutation(orpc.connections.openaiSignIn.poll.mutationOptions());
  const saveToken = useMutation(orpc.github.save.mutationOptions({ onSuccess: refresh }));
  const clearToken = useMutation(orpc.github.clear.mutationOptions({ onSuccess: refresh }));

  // Closing plays the open in reverse, so the panel keeps showing the last
  // tab until it is gone.
  const lastTab = useRef(tab);
  if (tab !== undefined) lastTab.current = tab;
  const open = tab !== undefined;
  const view = tab ?? lastTab.current;
  const title = view ? t(`settings.${view}`) : t("settings.title");

  return (
    <div
      role="dialog"
      aria-label={t("settings.title")}
      aria-hidden={!open}
      inert={!open}
      data-open={open}
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/25"
    >
      <div className="modal-panel flex h-[640px] max-h-[90svh] w-[820px] max-w-[94vw] overflow-hidden rounded-3xl bg-white shadow-xl">
        <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-[#E3E3E7] bg-[#F7F7F9] px-3 pt-5">
          <p className="px-3 pb-2 text-[13px] text-[#6E6E73]">{t("settings.title")}</p>
          {tabs.map(({ id, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              className={`flex h-10 items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium text-[#1C1C1E] ${
                id === view ? "bg-white" : "hover:bg-[#E8E8EC]"
              }`}
            >
              {Icon ? <Icon size={16} /> : <GitHubMark size={16} fill="#1C1C1E" />}
              {t(`settings.${id}`)}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#E3E3E7] px-6">
            <h2 className="text-[17px] font-semibold text-[#1C1C1E]">{title}</h2>
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={onClose}
              className="flex size-9 items-center justify-center rounded-full text-[#6E6E73] hover:bg-[#F7F7F9]"
            >
              <XIcon size={16} weight="bold" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            {view === "general" ? <GeneralPanel name={name} email={email} /> : null}
            {view === "providers" ? (
              <ProvidersPanel
                connections={resolved.connections}
                catalog={resolved.catalog}
                listed={listed}
                notice={notice}
                onNotice={setNotice}
                onSaveKey={async (input) => {
                  if (handlers?.onSaveKey) return handlers.onSaveKey(input);
                  await saveKey.mutateAsync(input);
                }}
                onRemove={async (id) => {
                  if (handlers?.onRemove) return handlers.onRemove(id);
                  await remove.mutateAsync({ id });
                }}
                onAddModel={async (input) => {
                  const models = handlers?.onAddModel
                    ? await handlers.onAddModel(input)
                    : await addModel.mutateAsync(input);
                  if (models) rememberModels(input.connectionId, models);
                  return models;
                }}
                onRemoveModel={async (input) => {
                  const models = handlers?.onRemoveModel
                    ? await handlers.onRemoveModel(input)
                    : await removeModel.mutateAsync(input);
                  if (models) rememberModels(input.connectionId, models);
                  return models;
                }}
                onRefresh={async () => {
                  if (handlers?.onRefresh) return handlers.onRefresh();
                  await refreshModels.mutateAsync({});
                }}
                onSignInStart={() =>
                  handlers?.onSignInStart ? handlers.onSignInStart() : signInStart.mutateAsync({})
                }
                onSignInPoll={async (input) => {
                  if (handlers?.onSignInPoll) return handlers.onSignInPoll(input);
                  const result = await signInPoll.mutateAsync(input);
                  if (result.status === "done") await refresh();
                  return result;
                }}
              />
            ) : null}
            {view === "appearance" ? <div /> : null}
            {view === "github" ? (
              <GithubPanel
                set={resolved.githubSet}
                pending={saveToken.isPending || clearToken.isPending}
                onSave={async (token) => {
                  if (handlers?.onSaveToken) return handlers.onSaveToken(token);
                  await saveToken.mutateAsync({ token });
                }}
                onClear={async () => {
                  if (handlers?.onClearToken) return handlers.onClearToken();
                  await clearToken.mutateAsync({});
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
