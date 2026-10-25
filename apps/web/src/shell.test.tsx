import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, screen } from "@testing-library/react";

import { ChatShell } from "./components/chat/chat-shell";
import { renderApp } from "./test-harness";

afterEach(() => cleanup());

const emptySettings = {
  connections: [],
  catalog: null,
  listed: {},
  githubSet: false,
};

test("signed-in shell shows the empty state and collapses the thread list", async () => {
  await renderApp(
    <ChatShell
      name="Eric"
      email="eric@example.com"
      role="admin"
      thread={undefined}
      settings={undefined}
      threadList={[{ id: "t1", title: "Morning notes", updatedAt: new Date().toISOString() }]}
      settingsData={emptySettings}
    />,
  );

  expect(await screen.findByText("Hello, Eric")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "How can I assist you today?" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "New chat" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Library" })).toBeTruthy();
  expect(screen.getByText("Admin")).toBeTruthy();
  expect(screen.getByLabelText("Eric")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Export chat" })).toBeTruthy();
  expect(screen.getByText("Morning notes")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Deeper Research" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Attach" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Tools" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Microphone" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Globe" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Voice" })).toBeTruthy();
  for (const title of ["Sort the meeting", "Review a pull request", "Chart these figures"]) {
    expect(screen.getByRole("button", { name: new RegExp(title) })).toBeTruthy();
  }
  expect(screen.getByText(/Pull the decisions, the open disputes/)).toBeTruthy();
  expect(screen.getByText(/Review AkaraChen\/chat#128/)).toBeTruthy();
  expect(screen.getByText(/Real GDP 1.8, 1.6, 1.8/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

  expect(screen.queryByText("Morning notes")).toBeNull();
  expect(screen.getByRole("link", { name: "New chat" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Library" })).toBeTruthy();
  expect(screen.getByLabelText("Eric")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
});

test("hover and active threads share a background, and the menu renames", async () => {
  await renderApp(
    <ChatShell
      name="Eric"
      email="eric@example.com"
      role="admin"
      thread="t1"
      settings={undefined}
      threadList={[
        { id: "t1", title: "Morning notes", updatedAt: new Date().toISOString() },
        {
          id: "t2",
          title: "Older note",
          updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ]}
      settingsData={emptySettings}
    />,
  );

  const active = await screen.findByRole("link", { name: "Morning notes" });
  const resting = screen.getByRole("link", { name: "Older note" });
  expect(active.parentElement?.className.split(/\s+/)).toContain("bg-[#E8E8EC]");
  expect(resting.parentElement?.className.split(/\s+/)).toContain("hover:bg-[#E8E8EC]");
  expect(resting.parentElement?.className.split(/\s+/)).not.toContain("bg-[#E8E8EC]");

  fireEvent.click(screen.getByRole("button", { name: "Actions for Morning notes" }));
  expect(await screen.findByRole("menuitem", { name: "Rename" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));

  const name = await screen.findByRole("textbox", { name: "Chat name" });
  expect((name as HTMLInputElement).value).toBe("Morning notes");
});
