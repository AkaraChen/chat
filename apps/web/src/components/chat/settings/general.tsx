import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type Locale, localeNames, locales, saveLocale, toLocale } from "@/i18n";

import { authClient } from "../../../auth-client";
import { usePreferences } from "../preferences";

export function GeneralPanel({ name, email }: { name: string; email: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [prefs, setPrefs] = usePreferences();
  const initial = name.trim().slice(0, 1).toUpperCase() || "A";

  // The root route reads the cookie again and hands down that language.
  function changeLocale(locale: Locale) {
    saveLocale(locale);
    void router.invalidate();
  }

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/" });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-[#6E6E73]">{t("general.account")}</h3>
        <div className="flex items-center gap-3 rounded-[12px] border border-[#E3E3E7] px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#E8E8EC] text-sm font-medium text-[#6E6E73]">
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
            {t("general.signOut")}
          </button>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-[#6E6E73]">{t("general.language")}</h3>
        <label className="relative block">
          <span className="sr-only">{t("general.language")}</span>
          <select
            aria-label={t("general.language")}
            value={toLocale(i18n.language) ?? "en"}
            onChange={(event) => changeLocale(event.target.value as Locale)}
            className="h-12 w-full appearance-none rounded-[12px] border border-[#E3E3E7] bg-white px-4 text-[15px] text-[#1C1C1E] outline-none"
          >
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {localeNames[locale]}
              </option>
            ))}
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
        <h3 className="text-[13px] text-[#6E6E73]">{t("general.preferences")}</h3>
        <div className="overflow-hidden rounded-[12px] border border-[#E3E3E7]">
          <Preference
            title={t("general.enterToSend")}
            detail={t("general.enterToSendDetail")}
            checked={prefs.enterToSend}
            onChange={(enterToSend) => setPrefs({ enterToSend })}
          />
          <Preference
            title={t("general.spellCheck")}
            detail={t("general.spellCheckDetail")}
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
    <div className="flex items-center gap-4 border-b border-[#E3E3E7] px-4 py-3 last:border-b-0">
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
        className={`relative h-6 w-11 shrink-0 rounded-full ${checked ? "bg-[#1A73E8]" : "bg-[#E8E8EC]"}`}
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
