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
  connections: [{ id: "or-1", type: "openrouter", label: "openrouter" }],
  catalog: {
    openrouter: {
      id: "openrouter",
      name: "OpenRouter",
      api: "https://openrouter.ai/api/v1",
      models: [],
    },
    custom: [],
  },
  listed: { "or-1": [{ id: "anthropic/claude-sonnet", name: "Reviewer" }] },
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
  expect(document.querySelector("form")?.className).toContain("#F7F7F9");

  fireEvent.click(screen.getByRole("button", { name: "Providers" }));
  expect(screen.getByText("OpenRouter is on this device. Add another model any time.")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "On this device" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Available" })).toBeTruthy();
  expect(screen.queryByText("Personal access token")).toBeNull();

  clickConnect("Anthropic");
  expect(screen.getByRole("button", { name: /Sign in with your browser/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Use an API key/ })).toBeTruthy();
  expect(screen.getByText("The key is stored on this device.")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /Sign in with your browser/ }));
  expect(screen.getByRole("heading", { name: "Finish in your browser" })).toBeTruthy();
  expect(screen.getByText("Nothing is saved until the provider confirms.")).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText(/is connected/)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Connection/ }));
  fireEvent.click(screen.getByRole("button", { name: /Use an API key/ }));
  expect(screen.getByRole("heading", { name: "Add your API key" })).toBeTruthy();
  expect(screen.getByText("The key is stored on this device.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-ant-test" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect((await screen.findByRole("status")).textContent).toContain("Anthropic is connected");

  fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
  expect(screen.getByRole("heading", { name: "Models" })).toBeTruthy();
  expect(screen.getByText("Reviewer")).toBeTruthy();
  expect(screen.getByText("anthropic/claude-sonnet")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add model" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove" })).toBeTruthy();
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
  fireEvent.change(screen.getByPlaceholderText("github_pat_…"), { target: { value: "github_pat_test" } });
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
          connections: [{ id: "or-1", type: "openrouter", label: "openrouter" }],
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
            },
          ],
          onRemoveModel: async () => [],
        }}
      />
    );
  }

  await renderApp(<Screen />);
  fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
  expect(screen.getByText("No models on this device yet.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add model" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "anthropic/claude-sonnet" } });
  fireEvent.change(screen.getByLabelText("Alias"), { target: { value: "Reviewer" } });
  const addButtons = screen.getAllByRole("button", { name: "Add model" });
  fireEvent.click(addButtons[addButtons.length - 1]!);
  expect(await screen.findByText("Reviewer")).toBeTruthy();
  expect(screen.getByText("anthropic/claude-sonnet")).toBeTruthy();
  expect(screen.queryByText("No models on this device yet.")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "‹ All providers" }));
  fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
  expect(screen.getByText("Reviewer")).toBeTruthy();
  expect(screen.queryByText("No models on this device yet.")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  expect(await screen.findByText("No models on this device yet.")).toBeTruthy();
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
