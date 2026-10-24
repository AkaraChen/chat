import { useEffect, useState } from "react";

export type Preferences = {
  enterToSend: boolean;
  spellCheck: boolean;
  language: "English";
};

const KEY = "the-chat-preferences";
const EVENT = "the-chat-preferences";

const defaults: Preferences = { enterToSend: true, spellCheck: false, language: "English" };

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
    };
  } catch {
    return defaults;
  }
}

export function writePreferences(next: Preferences) {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function usePreferences() {
  const [value, setValue] = useState(readPreferences);
  useEffect(() => {
    const sync = () => setValue(readPreferences());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [
    value,
    (patch: Partial<Preferences>) => writePreferences({ ...value, ...patch }),
  ] as const;
}
