import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { fromAcceptLanguage, fromCookie, type Locale, toLocale } from ".";

// The saved choice first, then what the browser asks for. In the browser the
// page's own `lang` stands in for the request: it is what the server chose.
export const resolveLocale = createIsomorphicFn()
  .server((): Locale => {
    const headers = getRequest().headers;
    return (
      fromCookie(headers.get("cookie")) ??
      fromAcceptLanguage(headers.get("accept-language")) ??
      "en"
    );
  })
  .client(
    (): Locale =>
      fromCookie(document.cookie) ??
      toLocale(document.documentElement.lang) ??
      fromAcceptLanguage(navigator.languages.join(",")) ??
      "en",
  );
