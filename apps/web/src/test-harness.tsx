import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { act, type ReactNode } from "react";

/** Mount a signed-in screen on /chat without the app's server router. */
export async function renderApp(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const chatRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/chat",
    validateSearch: (search: Record<string, unknown>) => ({
      thread: typeof search.thread === "string" ? search.thread : undefined,
      settings:
        search.settings === "general" ||
        search.settings === "providers" ||
        search.settings === "appearance" ||
        search.settings === "github"
          ? search.settings
          : undefined,
    }),
    component: () => ui,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, chatRoute]),
    history: createMemoryHistory({ initialEntries: ["/chat"] }),
  });
  await router.load();
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
  return Object.assign(view, { queryClient });
}
