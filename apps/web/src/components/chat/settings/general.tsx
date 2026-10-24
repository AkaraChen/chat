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
        <h3 className="text-[13px] text-[#6E6E73]">Account</h3>
        <div className="flex items-center gap-3 rounded-2xl border border-[#DCDCE0] px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#E4E4E7] text-sm font-medium text-[#1C1C1E]">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-[#1C1C1E]">{name}</span>
            <span className="block truncate text-[13px] text-[#6E6E73]">{email}</span>
          </span>
          <button
            type="button"
            onClick={signOut}
            disabled={pending}
            className="text-sm font-medium text-[#1A73E8] disabled:opacity-60"
          >
            Sign out
          </button>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-[#6E6E73]">Language</h3>
        <label className="relative block">
          <span className="sr-only">Language</span>
          <select
            aria-label="Language"
            value={prefs.language}
            onChange={() => setPrefs({ language: "English" })}
            className="h-12 w-full appearance-none rounded-xl bg-[#F7F7F9] px-4 text-[15px] text-[#1C1C1E] outline-none"
          >
            <option>English</option>
          </select>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[#6E6E73]"
          >
            ▾
          </span>
        </label>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-[#6E6E73]">Preferences</h3>
        <div className="overflow-hidden rounded-2xl border border-[#DCDCE0]">
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
    <div className="flex items-center gap-4 border-b border-[#DCDCE0] px-4 py-3 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-[#1C1C1E]">{title}</span>
        <span className="block text-[13px] text-[#6E6E73]">{detail}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full ${checked ? "bg-[#1A73E8]" : "bg-[#E4E4E7]"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${
            checked ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
