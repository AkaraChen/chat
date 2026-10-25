import { useState } from "react";
import { useTranslation } from "react-i18next";

import { GitHubMark } from "../../github-mark";

/** Personal access token. It lives on this tab, not on the provider list. */
export function GithubPanel({
  set,
  pending,
  onSave,
  onClear,
}: {
  set: boolean;
  pending?: boolean;
  onSave: (token: string) => Promise<void> | void;
  onClear: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-[12px] border border-line-quiet px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-solid text-on-solid">
          <GitHubMark size={16} fill="currentColor" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-ink">{t("githubPanel.token")}</span>
          <span className="block text-[13px] text-ink-secondary">
            {set ? t("githubPanel.saved") : t("githubPanel.notSet")}
          </span>
        </span>
        {set ? (
          <button
            type="button"
            onClick={() => void onClear()}
            disabled={pending}
            className="text-sm font-medium text-accent disabled:opacity-60"
          >
            {t("githubPanel.clear")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-accent"
          >
            {t("githubPanel.set")}
          </button>
        )}
      </div>
      {editing ? (
        <div
          role="dialog"
          aria-labelledby="github-token-title"
          className="inline-dialog rounded-2xl border border-line-quiet bg-paper p-5 shadow-[var(--elevation-modal)]"
        >
          <h3 id="github-token-title" className="text-[17px] font-semibold text-ink">
            {t("githubPanel.setTitle")}
          </h3>
          <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
            {t("githubPanel.setDetail")}
          </p>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink">{t("githubPanel.token")}</span>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="github_pat_…"
              autoComplete="off"
              spellCheck={false}
              className="h-11 rounded-[12px] border border-line-quiet bg-paper px-3 text-sm text-ink outline-none"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-9 rounded-lg border border-line-quiet px-3 text-sm text-ink"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={pending || token.trim() === ""}
              onClick={async () => {
                await onSave(token.trim());
                setToken("");
                setEditing(false);
              }}
              className="h-9 rounded-lg bg-accent px-3 text-sm font-medium text-on-accent disabled:opacity-40"
            >
              {t("githubPanel.save")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
