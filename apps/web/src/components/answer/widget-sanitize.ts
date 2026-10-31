import type { Config } from "dompurify";

/**
 * How DOMPurify cleans a widget fragment before it reaches the live DOM. The
 * CSP already stops fetches and outside resources; this takes out the rest:
 * a meta refresh that moves the frame, DNS prefetch links, pings, `<base>`,
 * nested frames and plugins, forms (whose submit would reload the frame),
 * `javascript:` URLs and SVG animations. Scripts and the usual event
 * handlers stay, since widgets need them; a script that navigates the frame
 * is caught by the host instead (see widget.tsx).
 *
 * Plain JSON, so the frame gets the same config as the tests.
 */
export const WIDGET_PURIFY_CONFIG = {
  ADD_TAGS: ["script", "style"],
  ADD_ATTR: [
    "onclick",
    "ondblclick",
    "oninput",
    "onchange",
    "onkeydown",
    "onkeyup",
    "onpointerdown",
    "onpointermove",
    "onpointerup",
    "onpointerenter",
    "onpointerleave",
    "onmouseenter",
    "onmouseleave",
    "onmouseover",
    "onmouseout",
    "onfocus",
    "onblur",
    "onwheel",
  ],
  FORBID_TAGS: ["meta", "link", "base", "iframe", "frame", "object", "embed", "portal", "form"],
  FORBID_ATTR: ["ping", "target", "action", "formaction", "srcdoc", "download"],
  // Keep a leading <style> or <script>, which would otherwise be read as head content.
  FORCE_BODY: true,
  // On by default, this drops any element whose text holds a "<", which
  // takes out ordinary scripts ("i < n", HTML in a string). It guards XML
  // contexts; the fragment only ever goes into HTML, and scripts run anyway.
  SAFE_FOR_XML: false,
} satisfies Config;
