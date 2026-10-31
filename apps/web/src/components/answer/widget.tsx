import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAsk } from "./ask";
import { WIDGET_SHELL, WIDGET_TOKENS } from "./widget-shell";

// How often streamed HTML is sent into the frame, and the least time between
// two follow-ups a widget may ask.
const SEND_MS = 120;
const ASK_GAP_MS = 1000;

function theme() {
  const style = getComputedStyle(document.documentElement);
  const vars: Record<string, string> = {
    "--radius": "10px",
    "--font-sans": getComputedStyle(document.body).fontFamily,
  };
  for (const token of WIDGET_TOKENS)
    vars[`--${token}`] = style.getPropertyValue(`--${token}`).trim();
  return { type: "theme", vars, dark: document.documentElement.classList.contains("dark") };
}

/**
 * A model-written HTML/SVG fragment in a sandboxed frame. The HTML streams in
 * as the tool input arrives; scripts run once `done`.
 */
export function Widget({ title, html, done }: { title: string; html: string; done: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const latest = useRef({ html, done });
  latest.current = { html, done };
  const [height, setHeight] = useState(0);
  // A frame that loads a second time, or says it is leaving, was navigated
  // away from its shell. Whatever it was showing is gone; take it down.
  const [stopped, setStopped] = useState(false);
  const loads = useRef(0);
  const { t } = useTranslation();
  const ask = useAsk();
  const askRef = useRef(ask);
  askRef.current = ask;

  const send = (message: Record<string, unknown>) =>
    frame.current?.contentWindow?.postMessage(message, "*");

  useEffect(() => {
    let lastAsk = 0;
    // The frame acts for the user only while it holds focus, which it gets
    // when the user clicks or types in it.
    const focused = () => document.activeElement === frame.current;
    function onMessage(event: MessageEvent) {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data?.widget) return;
      if (data.type === "ready") {
        ready.current = true;
        send(theme());
        send({ type: "render", ...latest.current });
      } else if (data.type === "height" && typeof data.height === "number") {
        setHeight(Math.min(Math.max(0, data.height), 4000));
      } else if (data.type === "ask" && typeof data.text === "string") {
        const now = Date.now();
        if (!askRef.current || !focused() || now - lastAsk < ASK_GAP_MS) return;
        lastAsk = now;
        askRef.current(data.text.slice(0, 2000));
      } else if (data.type === "open" && typeof data.url === "string") {
        if (!focused() || !/^https?:\/\//i.test(data.url)) return;
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else if (data.type === "leaving") {
        setStopped(true);
      } else if (data.type === "sanitized") {
        console.warn("widget: removed", data.removed);
      } else if (data.type === "error") {
        console.warn("widget:", data.message);
      }
    }
    window.addEventListener("message", onMessage);
    // The theme follows the app's light and dark switch.
    const observer = new MutationObserver(() => ready.current && send(theme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      window.removeEventListener("message", onMessage);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    if (done) {
      send({ type: "render", html, done });
      return;
    }
    const timer = setTimeout(() => send({ type: "render", html, done }), SEND_MS);
    return () => clearTimeout(timer);
  }, [html, done]);

  if (stopped) {
    return (
      <p
        data-answer-widget
        className="rounded-[12px] bg-recessed px-4 py-3 text-sm text-ink-secondary"
      >
        {t("answer.widgetStopped", { title })}
      </p>
    );
  }

  return (
    <figure data-answer-widget className="flex flex-col">
      {height === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-[12px] bg-recessed text-sm text-ink-tertiary">
          {title}
        </div>
      ) : null}
      <iframe
        ref={frame}
        title={title}
        sandbox="allow-scripts"
        srcDoc={WIDGET_SHELL}
        className="block w-full border-0"
        style={{ height }}
        onLoad={() => {
          loads.current += 1;
          if (loads.current > 1) setStopped(true);
        }}
      />
    </figure>
  );
}
