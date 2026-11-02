import { useEffect } from "react";

import {
  PREFERENCES_KEY,
  readPreferences,
  usePreferences,
  type Theme,
} from "./components/chat/preferences";

/** `system` follows the OS; the other two are what the reader picked. */
export function resolvedTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * The window's title bar in the installed app, the same as the shell's fill
 * so the two read as one surface. `--fill` in globals.css.
 */
export const windowColor = { light: "#f7f7f9", dark: "#24242c" } as const;

export function applyTheme(theme: Theme) {
  const resolved = resolvedTheme(theme);
  const dark = resolved === "dark";
  // The palette hangs off `.dark`, so it has to sit on the root element.
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  // The server's tags follow the OS; a choice made here overrides them.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = windowColor[resolved];
  }
}

/**
 * Runs in the head, before the first paint. Without it a stored choice
 * would show light until the app hydrates and then flip.
 */
export const themeScript = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  PREFERENCES_KEY,
)})||"{}");var t=p.theme==="light"||p.theme==="dark"?p.theme:null;var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

/** Keeps the root class in step with the preference, and with the OS. */
export function useThemeSync() {
  const [prefs] = usePreferences();
  useEffect(() => {
    // Read storage directly: the hook's first render holds the server
    // snapshot, and applying that would undo what the head script did.
    const stored = readPreferences().theme;
    applyTheme(stored);
    if (stored !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme("system");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [prefs.theme]);
}
