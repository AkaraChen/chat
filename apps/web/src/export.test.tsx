import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ChatMessage } from "@my-better-t-app/api/chat/message";

import "@/i18n";

import { ChatShell } from "./components/chat/chat-shell";
import { formatExportTime } from "./components/chat/export-dialog";
import { ShareView } from "./components/chat/share-view";
import { renderApp } from "./test-harness";
import { setTestFetch } from "./test-setup";

afterEach(() => {
  cleanup();
  setTestFetch(null);
});

const thread = { id: "t1", title: "Launch review", updatedAt: new Date().toISOString() };

function rpcOk(body: unknown) {
  return new Response(JSON.stringify({ json: body }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("export dialog defaults, the 10-minute helper, and the created link", async () => {
  const expiresAt = new Date("2026-10-26T13:41:00.000Z");
  let exports = 0;
  let sent: { id?: string; access?: string; duration?: string } = {};
  let copied = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text: string) => void (copied = text) },
  });
  setTestFetch(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/threads/export")) {
      exports += 1;
      const raw = input instanceof Request ? await input.json() : {};
      sent = (raw.json ?? raw) as typeof sent;
      return rpcOk({
        token: "payload.mac",
        access: sent.access,
        expiresAt: expiresAt.toISOString(),
      });
    }
    // Leave history pending so the composer never mounts. A failed read would
    // navigate off the thread; focusing its field also trips jsdom.
    if (url.endsWith("/threads/get")) return new Promise(() => {});
    if (url.endsWith("/models/list")) return rpcOk({ connections: [], choice: null });
    throw new Error(`unexpected ${url}`);
  });

  await renderApp(
    <ChatShell
      name="Eric"
      email="eric@example.com"
      role="admin"
      thread="t1"
      settings={undefined}
      threadList={[thread]}
      settingsData={{ connections: [], catalog: null, listed: {}, githubSet: false }}
    />,
  );

  fireEvent.click(await screen.findByRole("button", { name: "Export chat" }));
  expect(await screen.findByRole("dialog", { name: "Export chat" })).toBeTruthy();
  expect(screen.getByText("A read-only snapshot of Launch review.")).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Signed in" }).getAttribute("aria-checked")).toBe(
    "true",
  );
  expect(screen.getByRole("radio", { name: "Public" }).getAttribute("aria-checked")).toBe("false");
  expect(screen.getByRole("radio", { name: "1 day" }).getAttribute("aria-checked")).toBe("true");
  const dayHelper = screen.getByText(/^Stops working /).textContent ?? "";
  expect(dayHelper).toMatch(/^Stops working [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M\.$/);
  const dayDelta = Date.parse(dayHelper.slice("Stops working ".length, -1)) - Date.now();
  expect(dayDelta).toBeGreaterThan(23 * 60 * 60 * 1000);
  expect(dayDelta).toBeLessThan(25 * 60 * 60 * 1000);

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog", { name: "Export chat" })).toBeNull();
  expect(exports).toBe(0);

  fireEvent.click(screen.getByRole("button", { name: "Export chat" }));
  fireEvent.click(await screen.findByRole("radio", { name: "10 min" }));
  expect(screen.getByText("Stops working in 10 minutes.")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Public" }));
  fireEvent.click(screen.getByRole("button", { name: "Create link" }));

  const url = "http://localhost:3001/s/payload.mac";
  expect(await screen.findByText(url)).toBeTruthy();
  expect(sent).toMatchObject({ id: "t1", access: "public", duration: "10m" });
  expect(
    screen.getByText(`Public · expires ${formatExportTime(expiresAt, "en", false)}`),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Revoke link" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() => {
    if (copied !== url) throw new Error(`copied ${copied || "nothing"}`);
  });

  fireEvent.click(screen.getByRole("button", { name: "Revoke link" }));
  expect(screen.queryByText(url)).toBeNull();
  expect(screen.getByRole("button", { name: "Create link" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  expect(screen.getByRole("radio", { name: "Public" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByText("Stops working in 10 minutes.")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Create link" }));
  expect(await screen.findByRole("button", { name: "Done" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog", { name: "Export chat" })).toBeNull();
  expect(exports).toBe(2);
});

test("no link is minted when no thread is open", async () => {
  let exports = 0;
  setTestFetch(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/threads/export")) exports += 1;
    if (url.endsWith("/models/list")) return rpcOk({ connections: [], choice: null });
    throw new Error(`unexpected ${url}`);
  });
  await renderApp(
    <ChatShell
      name="Eric"
      email="eric@example.com"
      role="admin"
      thread={undefined}
      settings={undefined}
      threadList={[]}
      settingsData={{ connections: [], catalog: null, listed: {}, githubSet: false }}
    />,
  );
  // The empty state has no chat to export, so there is no button for it.
  expect(await screen.findByText("Hello, Eric")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Export chat" })).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Export chat" })).toBeNull();
  expect(exports).toBe(0);
});

test("the public share view shows the snapshot and no send control", async () => {
  const messages = [
    {
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "Ship the annual plan at $96." }],
    },
  ] as ChatMessage[];
  await act(async () => {
    render(<ShareView title="Launch review" messages={messages} />);
  });
  expect(screen.getByRole("heading", { name: "Launch review" })).toBeTruthy();
  expect(screen.getByText("Ship the annual plan at $96.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Voice" })).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Attach" })).toBeNull();

  const routeUrl = new URL("./routes/s.$token.tsx", import.meta.url);
  const route = readFileSync(routeUrl, "utf8");
  expect(routeUrl.pathname).not.toContain("/_member/");
  expect(route).toContain('"/s/$token"');
  expect(route).toContain("resolveThreadExport");
  expect(route).not.toContain("requireMember");
});
