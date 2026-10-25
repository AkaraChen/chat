import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";

import { en } from "./en";
import { zh } from "./zh";

export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

/** What each language is called, in that language. */
export const localeNames: Record<Locale, string> = { en: "English", zh: "简体中文" };

/** The value for `<html lang>`. */
export const htmlLang: Record<Locale, string> = { en: "en", zh: "zh-CN" };

export const LOCALE_COOKIE = "lang";
const YEAR_S = 365 * 24 * 60 * 60;

const resources = { en: { translation: en }, zh: { translation: zh } };

// One instance per language, made once and never switched. The server renders
// requests in different languages at the same time, so changing a shared
// instance's language mid-render would leak between them; swapping instances
// through the provider does not.
const instances = new Map<Locale, i18n>();

export function i18nFor(locale: Locale): i18n {
  let instance = instances.get(locale);
  if (!instance) {
    instance = i18next.createInstance();
    // English is also the instance a component gets outside any provider.
    if (locale === "en") instance.use(initReactI18next);
    void instance.init({
      lng: locale,
      fallbackLng: "en",
      resources,
      initAsync: false,
      // React escapes what it renders.
      interpolation: { escapeValue: false },
    });
    instances.set(locale, instance);
  }
  return instance;
}

i18nFor("en");

/** A language tag such as `zh-CN` or `en-US`, to a supported locale. */
export function toLocale(tag: string | null | undefined): Locale | undefined {
  const base = tag?.trim().toLowerCase().split(/[-_]/)[0];
  return locales.find((locale) => locale === base);
}

/** The first supported language in an Accept-Language header, by quality. */
export function fromAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((param) => param.trim().startsWith("q="));
      return { tag, q: q ? Number(q.trim().slice(2)) || 0 : 1, index };
    })
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of ranked) {
    const locale = toLocale(tag);
    if (locale) return locale;
  }
  return undefined;
}

/** The locale saved in a Cookie header or `document.cookie`. */
export function fromCookie(cookie: string | null | undefined): Locale | undefined {
  const pair = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  return toLocale(pair?.slice(LOCALE_COOKIE.length + 1));
}

/** Remember a choice for a year, so the server renders it next time. */
export function saveLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${YEAR_S}; samesite=lax`;
}
