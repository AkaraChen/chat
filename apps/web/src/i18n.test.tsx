import { afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";

import { GeneralPanel } from "./components/chat/settings/general";
import { Welcome } from "./components/welcome";
import { fromAcceptLanguage, fromCookie, i18nFor, toLocale } from "./i18n";
import { en } from "./i18n/en";
import { zh } from "./i18n/zh";

afterEach(() => {
  cleanup();
  document.cookie = "lang=; path=/; max-age=0";
});

test("language tags map to a supported locale", () => {
  expect(toLocale("zh-CN")).toBe("zh");
  expect(toLocale("zh_Hant_TW")).toBe("zh");
  expect(toLocale("en-GB")).toBe("en");
  expect(toLocale("fr")).toBeUndefined();
  expect(toLocale(undefined)).toBeUndefined();
});

test("Accept-Language picks the best supported language by quality", () => {
  expect(fromAcceptLanguage("fr-FR,fr;q=0.9,zh-CN;q=0.8,en;q=0.7")).toBe("zh");
  expect(fromAcceptLanguage("en;q=0.5,zh;q=0.9")).toBe("zh");
  expect(fromAcceptLanguage("de,fr")).toBeUndefined();
  expect(fromAcceptLanguage(null)).toBeUndefined();
});

test("the saved choice is read from the cookie", () => {
  expect(fromCookie("theme=dark; lang=zh; other=1")).toBe("zh");
  expect(fromCookie("language=zh")).toBeUndefined();
  expect(fromCookie("lang=xx")).toBeUndefined();
});

test("Chinese has every English string", () => {
  const keys = (value: object, prefix = ""): string[] =>
    Object.entries(value).flatMap(([key, child]) =>
      typeof child === "object" ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
    );
  expect(keys(zh)).toEqual(keys(en));
  for (const key of keys(zh)) expect(i18nFor("zh").exists(key)).toBe(true);
});

test("plurals follow each language", () => {
  expect(i18nFor("en").t("common.model", { count: 1 })).toBe("1 model");
  expect(i18nFor("en").t("common.model", { count: 3 })).toBe("3 models");
  expect(i18nFor("zh").t("common.model", { count: 3 })).toBe("3 个模型");
});

test("the welcome renders in Chinese under the Chinese instance", () => {
  render(
    <I18nextProvider i18n={i18nFor("zh")}>
      <Welcome onContinue={() => {}} />
    </I18nextProvider>,
  );
  expect(screen.getByRole("button", { name: /使用 GitHub 继续/ })).toBeTruthy();
});

test("outside any provider, components fall back to English", () => {
  render(<Welcome onContinue={() => {}} />);
  expect(screen.getByRole("button", { name: /Continue with GitHub/ })).toBeTruthy();
});

test("picking a language in settings saves it and redraws the app in it", async () => {
  // As the app's root route does: the cookie decides, and the provider follows.
  const rootRoute = createRootRoute({
    beforeLoad: () => ({ locale: fromCookie(document.cookie) ?? ("en" as const) }),
    component: function Root() {
      const { locale } = rootRoute.useRouteContext();
      return (
        <I18nextProvider i18n={i18nFor(locale)}>
          <Outlet />
        </I18nextProvider>
      );
    },
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <GeneralPanel name="Eric" email="eric@example.com" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  await act(async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });

  const select = screen.getByRole("combobox", { name: "Language" }) as HTMLSelectElement;
  expect(select.value).toBe("en");
  await act(async () => {
    fireEvent.change(select, { target: { value: "zh" } });
  });

  expect(fromCookie(document.cookie)).toBe("zh");
  expect(await screen.findByRole("combobox", { name: "语言" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
});
