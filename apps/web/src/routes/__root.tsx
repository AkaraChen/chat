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
import { useServiceWorker } from "../pwa";
import { themeScript, useThemeSync, windowColor } from "../theme";
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
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  useThemeSync();
  useServiceWorker();
  const { locale } = Route.useRouteContext();
  return (
    <html lang={htmlLang[locale]} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Here, not in `head`: it keeps one meta per name, and this takes two. */}
        <meta
          name="theme-color"
          content={windowColor.light}
          media="(prefers-color-scheme: light)"
        />
        <meta name="theme-color" content={windowColor.dark} media="(prefers-color-scheme: dark)" />
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
