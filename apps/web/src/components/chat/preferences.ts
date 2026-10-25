import { useCallback, useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";

export type Preferences = {
  enterToSend: boolean;
  spellCheck: boolean;
  language: "English";
  theme: Theme;
};

export const PREFERENCES_KEY = "the-chat-preferences";

const KEY = PREFERENCES_KEY;
const EVENT = "the-chat-preferences";

const defaults: Preferences = {
  enterToSend: true,
  spellCheck: false,
  language: "English",
  theme: "system",
};

function themeOf(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

export function readPreferences(): Preferences {
  if (typeof localStorage === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      enterToSend: parsed.enterToSend !== false,
      spellCheck: parsed.spellCheck === true,
      language: "English",
      theme: themeOf(parsed.theme),
    };
  } catch {
    return defaults;
  }
}

export function writePreferences(next: Preferences) {
  localStorage.setItem(KEY, JSON.stringify(next));
  cached = null;
  window.dispatchEvent(new Event(EVENT));
}

// The snapshot has to keep its identity between reads, or React would see a
// new value on every render. It is dropped when storage changes.
let cached: Preferences | null = null;

function snapshot() {
  cached ??= readPreferences();
  return cached;
}

function subscribe(listener: () => void) {
  const sync = () => {
    cached = null;
    listener();
  };
  window.addEventListener(EVENT, sync);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(EVENT, sync);
    window.removeEventListener("storage", sync);
  };
}

/**
 * Preferences live in localStorage. The server cannot know them, so the first
 * client render uses the defaults and the stored values arrive right after
 * hydration; without that, the markup would disagree with the server.
 */
export function usePreferences() {
  const value = useSyncExternalStore(subscribe, snapshot, () => defaults);
  const set = useCallback(
    (patch: Partial<Preferences>) => writePreferences({ ...snapshot(), ...patch }),
    [],
  );
  return [value, set] as const;
}
