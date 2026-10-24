import { useState } from "react";

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
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl border border-[#DCDCE0] px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1C1C1E]">
          <GitHubMark size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-[#1C1C1E]">Personal access token</span>
          <span className="block text-[13px] text-[#6E6E73]">
            {set
              ? "Saved on this device. It is not shown again."
              : "Not set. Used only to read pull requests."}
          </span>
        </span>
        {set ? (
          <button
            type="button"
            onClick={() => void onClear()}
            disabled={pending}
            className="text-sm font-medium text-[#1A73E8] disabled:opacity-60"
          >
            Clear
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-[#1A73E8]"
          >
            Set token
          </button>
        )}
      </div>
      {editing ? (
        <div
          role="dialog"
          aria-labelledby="github-token-title"
          className="rounded-2xl border border-[#DCDCE0] bg-white p-5 shadow-xl"
        >
          <h3 id="github-token-title" className="text-[17px] font-semibold text-[#1C1C1E]">
            Set a token
          </h3>
          <p className="mt-1 text-[13px] leading-5 text-[#6E6E73]">
            Paste a GitHub personal access token. It is used only to read pull requests, then saved
            on this device and not shown again.
          </p>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-[#1C1C1E]">Personal access token</span>
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="github_pat_…"
              autoComplete="off"
              spellCheck={false}
              className="h-11 rounded-xl border border-[#DCDCE0] bg-[#F7F7F9] px-3 text-sm text-[#1C1C1E] outline-none"
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-9 rounded-lg border border-[#DCDCE0] px-3 text-sm text-[#1C1C1E]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || token.trim() === ""}
              onClick={async () => {
                await onSave(token.trim());
                setToken("");
                setEditing(false);
              }}
              className="h-9 rounded-lg bg-[#1A73E8] px-3 text-sm font-medium text-white disabled:opacity-40"
            >
              Save token
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
