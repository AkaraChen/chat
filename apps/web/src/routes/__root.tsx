import { Toaster } from "@my-better-t-app/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { I18nextProvider } from "react-i18next";

import { htmlLang, i18nFor, type Locale } from "@/i18n";
import { resolveLocale } from "@/i18n/locale";

import type { orpc } from "@/utils/orpc";

import appCss from "../index.css?url";
export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  // Again on every navigation, so a new choice takes after an invalidate.
  beforeLoad: (): { locale: Locale } => ({ locale: resolveLocale() }),
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "The Chat",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  const { locale } = Route.useRouteContext();
  return (
    <html lang={htmlLang[locale]}>
      <head>
        <HeadContent />
      </head>
      <body>
        <I18nextProvider i18n={i18nFor(locale)}>
          <Outlet />
        </I18nextProvider>
        <Toaster richColors />
        <TanStackRouterDevtools position="bottom-left" />
        <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
