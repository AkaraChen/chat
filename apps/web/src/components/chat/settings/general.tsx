import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "../../../auth-client";
import { usePreferences } from "../preferences";

export function GeneralPanel({ name, email }: { name: string; email: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [prefs, setPrefs] = usePreferences();
  const initial = name.trim().slice(0, 1).toUpperCase() || "A";

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/" });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-ink-secondary">Account</h3>
        <div className="flex items-center gap-3 rounded-[12px] border border-line-quiet px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fill-strong text-sm font-medium text-ink-secondary">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-ink">{name}</span>
            <span className="block truncate text-[13px] text-ink-secondary">{email}</span>
          </span>
          <button
            type="button"
            onClick={signOut}
            disabled={pending}
            className="text-sm font-medium text-accent disabled:opacity-60"
          >
            Sign out
          </button>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-ink-secondary">Language</h3>
        <label className="relative block">
          <span className="sr-only">Language</span>
          <select
            aria-label="Language"
            value={prefs.language}
            onChange={() => setPrefs({ language: "English" })}
            className="h-12 w-full appearance-none rounded-[12px] border border-line-quiet bg-paper px-4 text-[15px] text-ink outline-none"
          >
            <option>English</option>
          </select>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-secondary"
          >
            ▾
          </span>
        </label>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-ink-secondary">Preferences</h3>
        <div className="overflow-hidden rounded-[12px] border border-line-quiet">
          <Preference
            title="Enter to send"
            detail="Press Enter to send a message, Shift + Enter for a new line."
            checked={prefs.enterToSend}
            onChange={(enterToSend) => setPrefs({ enterToSend })}
          />
          <Preference
            title="Spell check"
            detail="Underline misspelled words as you type."
            checked={prefs.spellCheck}
            onChange={(spellCheck) => setPrefs({ spellCheck })}
          />
        </div>
      </section>
    </div>
  );
}

function Preference({
  title,
  detail,
  checked,
  onChange,
}: {
  title: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-line-quiet px-4 py-3 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink">{title}</span>
        <span className="block text-[13px] text-ink-secondary">{detail}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full ${checked ? "bg-accent" : "bg-fill-strong"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-thumb transition-transform ${
            checked ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
