import { usePreferences, type Theme } from "../preferences";

const themes: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function AppearancePanel() {
  const [prefs, setPrefs] = usePreferences();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] text-ink-secondary">Theme</h3>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="flex gap-1 rounded-[12px] border border-line-quiet bg-recessed p-1"
        >
          {themes.map((theme) => {
            const active = prefs.theme === theme.value;
            return (
              <button
                key={theme.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPrefs({ theme: theme.value })}
                className={`h-9 flex-1 rounded-[8px] text-sm font-medium ${
                  active ? "bg-paper text-ink shadow-sm" : "text-ink-secondary hover:text-ink"
                }`}
              >
                {theme.label}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] leading-5 text-ink-secondary">
          System follows the appearance of this device.
        </p>
      </section>
    </div>
  );
}
