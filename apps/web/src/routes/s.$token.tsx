import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { ShareUnavailable, ShareView } from "../components/chat/share-view";

// Outside /_member, so a public link is not behind the member gate. The
// token is checked on the server; the secret never reaches the browser.
// Message parts carry `unknown` tool input, which the output check cannot
// express; they are plain JSON from the database, so the check is off.
const loadShare = createServerFn({ method: "GET", strict: { output: false } })
  .validator((token: string) => {
    if (typeof token !== "string" || token.length === 0) throw new Error("Missing token.");
    return token;
  })
  .handler(async ({ data: token }) => {
    const [{ resolveThreadExport }, { toRole }, { auth }, { ENV }, { db }, { getRequest }] =
      await Promise.all([
        import("@my-better-t-app/api/export/share"),
        import("@my-better-t-app/db/auth"),
        import("../auth"),
        import("../env.server"),
        import("../services"),
        import("@tanstack/react-start/server"),
      ]);
    const result = await auth.api.getSession({ headers: getRequest().headers });
    return resolveThreadExport({
      db,
      secret: ENV.BETTER_AUTH_SECRET,
      token,
      session: result ? { userId: result.user.id, role: toRole(result.user.role) } : null,
    });
  });

export const Route = createFileRoute("/s/$token")({
  // A shared chat is for whoever has the link, not for search engines.
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  loader: ({ params }) => loadShare({ data: params.token }),
  component: SharePage,
});

function SharePage() {
  const result = Route.useLoaderData();
  if (result.status !== "ok") return <ShareUnavailable reason={result.status} />;
  return <ShareView title={result.thread.title} messages={result.thread.messages} />;
}
