import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";

import { Composer } from "./components/chat/composer";
import {
  SettingsDialog,
  type SettingsData,
  type SettingsTab,
} from "./components/chat/settings/settings-dialog";
import { renderApp } from "./test-harness";

afterEach(() => cleanup());

const base: SettingsData = {
  connections: [{ id: "or-1", type: "openrouter", method: "api_key", label: "openrouter" }],
  catalog: {
    openrouter: {
      id: "openrouter",
      name: "OpenRouter",
      api: "https://openrouter.ai/api/v1",
      models: [],
    },
    custom: [],
  },
  listed: {
    "or-1": [
      { id: "moonshotai/kimi-k2", name: "Kimi K2" },
      { id: "acme/preview", name: "Reviewer", manual: true },
    ],
  },
  githubSet: false,
};

function SettingsScreen() {
  const [tab, setTab] = useState<SettingsTab>("general");
  const [githubSet, setGithubSet] = useState(false);
  return (
    <>
      <SettingsDialog
        tab={tab}
        name="Eric"
        email="eric@example.com"
        onTab={setTab}
        onClose={() => setTab("general")}
        data={{ ...base, githubSet }}
        handlers={{
          onSaveKey: async () => {},
          onRemove: async () => {},
          onAddModel: async () => {},
          onRemoveModel: async () => {},
          onRefresh: async () => {},
          onSignInStart: async () => ({
            deviceAuthId: "dev-1",
            userCode: "ABCD-1234",
            verificationUrl: "https://auth.openai.com/codex/device",
            intervalSeconds: 0.01,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }),
          onSignInPoll: async () => ({ status: "done" }),
          onSaveToken: async () => setGithubSet(true),
          onClearToken: async () => setGithubSet(false),
        }}
      />
      <Composer value="" onChange={() => {}} onSend={() => {}} placeholder="Ask me anything..." />
    </>
  );
}

function clickConnect(title: string) {
  const row = screen.getByText(title).closest("div");
  if (!row) throw new Error(`No row for ${title}`);
  fireEvent.click(within(row).getByRole("button", { name: "Connect" }));
}

test("settings dialog covers general, providers, appearance, and github", async () => {
  await renderApp(<SettingsScreen />);

  expect(await screen.findByRole("dialog", { name: "Settings" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "General" })).toBeTruthy();
  expect(screen.getByText("Eric")).toBeTruthy();
  expect(screen.getByText("eric@example.com")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Language" })).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Enter to send" })).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Spell check" })).toBeTruthy();
  expect(document.querySelector("form")?.className).toContain("bg-paper");

  fireEvent.click(screen.getByRole("button", { name: "Providers" }));
  expect(
    screen.getByText("OpenRouter is on this device. Add another model any time."),
  ).toBeTruthy();
  expect(screen.getByRole("heading", { name: "On this device" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Available" })).toBeTruthy();
  expect(screen.queryByText("Personal access token")).toBeNull();

  // Anthropic is gone; OpenAI offers a ChatGPT sign-in or a key.
  expect(screen.queryByText("Anthropic")).toBeNull();
  expect(screen.getByText("ChatGPT account or API key")).toBeTruthy();
  clickConnect("OpenAI");
  expect(screen.getByRole("button", { name: /Sign in with ChatGPT/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Use an API key/ })).toBeTruthy();

  // The sign-in shows the code, checks back, and finishes on its own.
  fireEvent.click(screen.getByRole("button", { name: /Sign in with ChatGPT/ }));
  expect(screen.getByRole("heading", { name: "Enter this code at OpenAI" })).toBeTruthy();
  expect((await screen.findByLabelText("Sign-in code")).textContent).toBe("ABCD-1234");
  expect(screen.getByRole("link", { name: "Open OpenAI" }).getAttribute("href")).toBe(
    "https://auth.openai.com/codex/device",
  );
  expect((await screen.findByRole("status")).textContent).toContain("OpenAI is connected");

  // Every other provider goes straight to the key.
  clickConnect("Google");
  expect(screen.getByRole("heading", { name: "Add your API key" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Sign in/ })).toBeNull();
  expect(screen.getByText(/The key is stored on this device/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("API key"), { target: { value: "AIza-test" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect((await screen.findByRole("status")).textContent).toContain("Google is connected");

  // Synced models are listed; only one added by hand can be removed.
  expect(screen.getByText("API key · 2 models")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
  expect(screen.getByRole("heading", { name: "Models" })).toBeTruthy();
  expect(screen.getByText("2 models")).toBeTruthy();
  expect(screen.getByText("Kimi K2")).toBeTruthy();
  expect(screen.getByText("Reviewer")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Refresh models" }));
  expect(await screen.findByText("Models are up to date")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add model" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add model" }));
  expect(screen.getByLabelText("Alias")).toBeTruthy();
  expect(screen.getByLabelText("Name")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
  expect(screen.getByRole("heading", { name: "Appearance" })).toBeTruthy();
  expect(screen.queryByText("Personal access token")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "GitHub" }));
  expect(screen.getByText(/Not set/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Set token" }));
  expect(screen.getByRole("heading", { name: "Set a token" })).toBeTruthy();
  expect(screen.getByText(/saved on this device/i)).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText("github_pat_…"), {
    target: { value: "github_pat_test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save token" }));
  expect(await screen.findByRole("button", { name: "Clear" })).toBeTruthy();
  expect(screen.getByText(/Saved on this device/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(await screen.findByText(/Not set/)).toBeTruthy();
});

test("a saved model shows without waiting for the proxy list", async () => {
  function Screen() {
    const [tab, setTab] = useState<SettingsTab>("providers");
    return (
      <SettingsDialog
        tab={tab}
        name="Eric"
        email="eric@example.com"
        onTab={setTab}
        onClose={() => setTab("providers")}
        data={{
          connections: [{ id: "or-1", type: "openrouter", method: "api_key", label: "openrouter" }],
          catalog: {
            openrouter: {
              id: "openrouter",
              name: "OpenRouter",
              api: "https://openrouter.ai/api/v1",
              models: [],
            },
            custom: [],
          },
          listed: {},
          githubSet: false,
        }}
        handlers={{
          onAddModel: async (input) => [
            {
              name: input.modelId,
              alias: input.modelId,
              display_name: input.displayName || input.modelId,
              manual: true,
            },
          ],
          onRemoveModel: async () => [],
        }}
      />
    );
  }

  await renderApp(<Screen />);
  fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
  expect(screen.getByText("No models yet. Refresh to sync them from models.dev.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add model" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "acme/preview" } });
  fireEvent.change(screen.getByLabelText("Alias"), { target: { value: "Reviewer" } });
  const addButtons = screen.getAllByRole("button", { name: "Add model" });
  fireEvent.click(addButtons[addButtons.length - 1]!);
  expect(await screen.findByText("Reviewer")).toBeTruthy();
  expect(screen.getByText("acme/preview")).toBeTruthy();
  expect(screen.queryByText("No models yet. Refresh to sync them from models.dev.")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "‹ All providers" }));
  fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
  expect(screen.getByText("Reviewer")).toBeTruthy();
  expect(screen.queryByText("No models yet. Refresh to sync them from models.dev.")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  expect(
    await screen.findByText("No models yet. Refresh to sync them from models.dev."),
  ).toBeTruthy();
  expect(screen.queryByText("Reviewer")).toBeNull();
});

test("closed settings does not request provider data", async () => {
  const view = await renderApp(
    <SettingsDialog
      tab={undefined}
      name="Eric"
      email="eric@example.com"
      onTab={() => {}}
      onClose={() => {}}
    />,
  );
  await new Promise((resolve) => setTimeout(resolve, 40));
  for (const query of view.queryClient.getQueryCache().getAll()) {
    expect(query.state.fetchStatus).toBe("idle");
    expect(query.state.fetchFailureCount).toBe(0);
  }
});

test("open settings requests provider data", async () => {
  const view = await renderApp(
    <SettingsDialog
      tab="general"
      name="Eric"
      email="eric@example.com"
      onTab={() => {}}
      onClose={() => {}}
    />,
  );
  await waitFor(() => {
    const started = view.queryClient
      .getQueryCache()
      .getAll()
      .some((query) => query.state.fetchStatus === "fetching" || query.state.fetchFailureCount > 0);
    expect(started).toBe(true);
  });
});
