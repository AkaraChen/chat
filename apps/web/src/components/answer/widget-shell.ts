import purify from "dompurify/dist/purify.min.js?raw";
import morphdom from "morphdom/dist/morphdom-umd.min.js?raw";

import { WIDGET_PURIFY_CONFIG } from "./widget-sanitize";

// The document a widget runs in: an iframe with `sandbox="allow-scripts"`
// (an opaque origin, so no cookies, storage or access to the app) and a CSP
// that lets scripts come only from the shell and four CDNs and reaches
// nothing else. See docs/generative-ui/spec.md, "Widgets".

const CDNS =
  "https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://esm.sh";

export const WIDGET_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' ${CDNS}`,
  `style-src 'unsafe-inline' ${CDNS}`,
  `font-src data: ${CDNS}`,
  "img-src data: blob:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** The app's colour tokens a widget may use, passed in as CSS variables. */
export const WIDGET_TOKENS = [
  "paper",
  "ink",
  "ink-secondary",
  "ink-tertiary",
  "line",
  "line-quiet",
  "line-strong",
  "fill",
  "fill-strong",
  "recessed",
  "accent",
  "accent-soft",
  "accent-line",
  "add",
  "add-soft",
  "remove",
  "remove-soft",
  "warn",
  "on-accent",
] as const;

// Controls come styled so a widget can write bare tags.
const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent}
body{font-family:var(--font-sans,system-ui,sans-serif);font-size:15px;line-height:1.6;color:var(--ink);-webkit-font-smoothing:antialiased}
#root{display:block;width:100%}
h1,h2,h3,h4{font-weight:500;margin:0 0 .5em;color:var(--ink)}
h1{font-size:20px}h2{font-size:17px}h3{font-size:15px}
p{margin:0 0 .75em}
a{color:var(--accent)}
svg text{fill:var(--ink)}
button{font:inherit;font-size:14px;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:8px;padding:6px 12px;cursor:pointer}
button:hover{background:var(--fill)}
button:active{transform:translateY(1px)}
button:disabled{opacity:.5;cursor:default}
input[type=text],input[type=number],input[type=search],select,textarea{font:inherit;font-size:14px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:6px 10px;min-height:36px}
input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
input[type=range]{accent-color:var(--accent);width:100%}
input[type=checkbox],input[type=radio]{accent-color:var(--accent)}
table{border-collapse:collapse}
`;

// Runs inside the frame. Talks to the host only through postMessage.
function bridge() {
  const root = document.getElementById("root")!;
  type Removed = { element?: Node; attribute?: Attr | null; from?: Node };
  const {
    morphdom: morph,
    DOMPurify: purify,
    purifyConfig,
  } = window as unknown as {
    morphdom: (a: Element, b: Element, o?: object) => void;
    DOMPurify: { sanitize: (html: string, config: object) => string; removed: Removed[] };
    purifyConfig: object;
  };
  const reported = new Set<string>();
  let done = false;
  let rendered = "";
  const post = (message: Record<string, unknown>) =>
    parent.postMessage({ widget: true, ...message }, "*");

  Object.assign(window, {
    sendPrompt: (text: unknown) => post({ type: "ask", text: String(text) }),
    openLink: (url: unknown) => post({ type: "open", url: String(url) }),
  });
  document.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link) return;
    event.preventDefault();
    post({ type: "open", url: link.href });
  });
  window.addEventListener("error", (event) => post({ type: "error", message: event.message }));
  // The frame is being navigated away: the host takes it down.
  window.addEventListener("pagehide", () => post({ type: "leaving" }));

  function render(html: string) {
    // Cleaned by DOMPurify, then parsed in an inert template (where scripts
    // never run) and only then moved in.
    const template = document.createElement("template");
    template.innerHTML = purify.sanitize(html, purifyConfig);
    const removed = purify.removed
      .map((item) =>
        item.element
          ? `<${item.element.nodeName.toLowerCase()}>`
          : `${item.from?.nodeName.toLowerCase()}[${item.attribute?.name ?? "?"}]`,
      )
      // FORCE_BODY's own placeholder is not something the widget wrote.
      .filter((item) => item !== "<remove>" && !reported.has(item));
    if (removed.length) {
      removed.forEach((item) => reported.add(item));
      post({ type: "sanitized", removed });
    }
    const next = document.createElement("div");
    next.id = "root";
    next.append(template.content);
    morph(root, next, {
      onBeforeElUpdated: (from: Element, to: Element) => !from.isEqualNode(to),
      onNodeAdded: (node: Node) => {
        if (!done && node instanceof HTMLElement && node.animate) {
          node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
        }
        return node;
      },
    });
  }

  // Scripts parsed by innerHTML never run; put fresh ones in their place, in order.
  function runScripts() {
    const scripts = Array.from(root.querySelectorAll("script"));
    const next = (index: number) => {
      const old = scripts[index];
      if (!old) return;
      const script = document.createElement("script");
      for (const attr of Array.from(old.attributes)) script.setAttribute(attr.name, attr.value);
      if (old.src) {
        script.onload = script.onerror = () => next(index + 1);
        old.replaceWith(script);
      } else {
        script.textContent = old.textContent;
        old.replaceWith(script);
        next(index + 1);
      }
    };
    next(0);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || typeof data !== "object") return;
    if (data.type === "theme") {
      const style = document.documentElement.style;
      for (const [name, value] of Object.entries(data.vars as Record<string, string>)) {
        style.setProperty(name, value);
      }
      style.colorScheme = data.dark ? "dark" : "light";
    }
    // Once the scripts have run, the DOM is theirs; a repeat of the same
    // HTML must not undo what they did.
    if (data.type === "render" && !done && typeof data.html === "string") {
      if (data.html !== rendered) {
        rendered = data.html;
        render(data.html);
      }
      if (data.done) {
        done = true;
        runScripts();
      }
    }
  });

  const report = () =>
    post({ type: "height", height: Math.ceil(root.getBoundingClientRect().height) });
  new ResizeObserver(report).observe(root);
  post({ type: "ready" });
}

/** The srcdoc of every widget frame. Its content arrives by postMessage. */
export const WIDGET_SHELL = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${WIDGET_CSP}"><style>${BASE_CSS}</style></head><body><div id="root"></div><script>${morphdom}</script><script>${purify}</script><script>window.purifyConfig=${JSON.stringify(WIDGET_PURIFY_CONFIG)}</script><script>(${bridge.toString()})()</script></body></html>`;
