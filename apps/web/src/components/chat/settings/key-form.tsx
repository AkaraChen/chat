import { useState } from "react";

import { Spinner } from "../../spinner";

/** Paste a secret, save it. The field never shows a stored value. */
export function KeyForm({
  label,
  placeholder,
  help,
  submitLabel = "Connect",
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder: string;
  help?: { href: string; text: string };
  submitLabel?: string;
  pending: boolean;
  error?: string | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim() && !pending) onSubmit(value.trim());
      }}
      className="flex flex-col gap-2 pb-3 pl-11"
    >
      <div className="flex items-center gap-2">
        <input
          type="password"
          aria-label={label}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          className="h-10 min-w-0 flex-1 rounded-xl bg-[#F3F3F5] px-3.5 text-sm text-[#1C1C1E] outline-none placeholder:text-[#9E9EA4] focus:ring-2 focus:ring-[#1A73E8]/40"
        />
        <button
          type="submit"
          disabled={!value.trim() || pending}
          className="flex h-10 items-center gap-2 rounded-xl bg-[#1A73E8] px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending && <Spinner size={14} light />}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-xl px-3 text-sm text-[#6E6E73] hover:bg-[#F3F3F5]"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="text-[13px] text-[#C2410C]">{error}</p>
      ) : help ? (
        <a href={help.href} target="_blank" rel="noreferrer" className="text-[13px] text-[#1A73E8]">
          {help.text}
        </a>
      ) : null}
    </form>
  );
}
