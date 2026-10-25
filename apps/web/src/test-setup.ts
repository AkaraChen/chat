import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost:3001/",
  pretendToBeVisual: true,
});

const { window } = dom;

const names = [
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "DocumentFragment",
  "SVGElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLButtonElement",
  "HTMLSelectElement",
  "HTMLFormElement",
  "HTMLAnchorElement",
  "Document",
  "NodeFilter",
  "DOMParser",
  "MutationObserver",
  "localStorage",
  "sessionStorage",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "KeyboardEvent",
  "PointerEvent",
  "FocusEvent",
  "InputEvent",
  "Image",
] as const;

Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: window });
for (const name of names) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: (window as unknown as Record<string, unknown>)[name],
  });
}

window.requestAnimationFrame ??= (callback: FrameRequestCallback) =>
  setTimeout(() => callback(Date.now()), 0) as unknown as number;
window.cancelAnimationFrame ??= (id: number) => clearTimeout(id);
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
const scrollTo = () => {};
window.scrollTo = scrollTo;
globalThis.scrollTo = scrollTo;
window.HTMLElement.prototype.scrollTo = scrollTo;
window.HTMLElement.prototype.scrollIntoView = scrollTo;

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserver as unknown as typeof globalThis.ResizeObserver;
window.ResizeObserver = ResizeObserver as unknown as typeof window.ResizeObserver;

window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  }) as MediaQueryList;

// RPCLink binds this function when the client module loads, so tests swap the
// body instead of replacing global fetch afterwards.
// The call alone: Bun's `typeof fetch` also carries `preconnect`.
type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const networkDisabled: TestFetch = async () => {
  throw new Error("network disabled in tests");
};
let testFetch: TestFetch = networkDisabled;

export function setTestFetch(next: TestFetch | null) {
  testFetch = next ?? networkDisabled;
}

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  testFetch(input, init)) as unknown as typeof fetch;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
