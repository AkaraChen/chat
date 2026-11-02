import { useEffect } from "react";

/**
 * Registers the service worker in public/sw.js, which gives the installed app
 * a page of its own when it opens offline. Not in development, where it would
 * only stand between Vite and the browser.
 */
export function useServiceWorker() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app works without it; only the offline page is lost.
    });
  }, []);
}
