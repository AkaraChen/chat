import { useTranslation } from "react-i18next";

import { usePreferences, type Theme } from "../preferences";

const themes: Theme[] = ["system", "light", "dark"];

export function AppearancePanel() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = usePreferences();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-ink-secondary">{t("appearance.theme")}</h3>
        <div
          role="radiogroup"
          aria-label={t("appearance.theme")}
          className="flex gap-1 rounded-[12px] border border-line-quiet bg-recessed p-1"
        >
          {themes.map((theme) => {
            const active = prefs.theme === theme;
            return (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPrefs({ theme })}
                className={`h-9 flex-1 rounded-[8px] text-sm font-medium ${
                  active ? "bg-paper text-ink shadow-sm" : "text-ink-secondary hover:text-ink"
                }`}
              >
                {t(`appearance.${theme}`)}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] leading-5 text-ink-secondary">{t("appearance.systemDetail")}</p>
      </section>
    </div>
  );
}
