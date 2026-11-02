import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { FileUIPart } from "ai";
import { useState } from "react";

import { Composer } from "./components/chat/composer";
import { readPreferences } from "./components/chat/preferences";
import { GeneralPanel } from "./components/chat/settings/general";
import { renderApp } from "./test-harness";
import { setTestFetch } from "./test-setup";

afterEach(() => {
  localStorage.removeItem("the-chat-preferences");
  setTestFetch(null);
  cleanup();
});

function Draft({ onSend }: { onSend: () => void }) {
  const [value, setValue] = useState("Hello");
  return (
    <>
      <GeneralPanel name="Eric" email="eric@example.com" />
      <Composer
        value={value}
        onChange={setValue}
        onSend={onSend}
        placeholder="Ask me anything..."
      />
    </>
  );
}

test("a draft still sends when Enter to send is off", async () => {
  let sent = 0;
  await renderApp(<Draft onSend={() => (sent += 1)} />);
  const field = screen.getByRole("textbox");

  fireEvent.keyDown(field, { key: "Enter" });
  expect(sent).toBe(1);

  fireEvent.click(screen.getByRole("switch", { name: "Enter to send" }));
  fireEvent.keyDown(field, { key: "Enter" });
  expect(sent).toBe(1);

  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(sent).toBe(2);

  fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
  expect(sent).toBe(3);
  fireEvent.keyDown(field, { key: "Enter", metaKey: true });
  expect(sent).toBe(4);
});

test("web search is on until switched off, and the switch lights up while it is off", async () => {
  await renderApp(<Composer value="" onChange={() => {}} onSend={() => {}} placeholder="Ask" />);
  const web = screen.getByRole("button", { name: "Web search off" });
  expect(web.getAttribute("aria-pressed")).toBe("false");
  expect(web.className).not.toContain("bg-accent-soft");
  expect(readPreferences().webSearch).toBe(true);

  fireEvent.click(web);
  expect(web.getAttribute("aria-pressed")).toBe("true");
  expect(web.className).toContain("bg-accent-soft");
  expect(readPreferences().webSearch).toBe(false);

  // Nothing typed or attached: nothing to send, and no voice button in its place.
  expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("button", { name: "Voice" })).toBeNull();
});

test("a file uploads as it is attached, then goes out with the message", async () => {
  const posted: string[] = [];
  setTestFetch(async (input, init) => {
    posted.push(`${init?.method} ${String(input)}`);
    const file = (init!.body as FormData).get("file") as File;
    if (file.name === "blob.bin") {
      return new Response("Only images, PDFs, office documents and text files can be attached.", {
        status: 415,
      });
    }
    return Response.json({
      id: "f1",
      url: "/api/files/f1",
      name: file.name,
      mediaType: "text/plain",
      size: file.size,
    });
  });
  const sent: FileUIPart[][] = [];
  await renderApp(
    <Composer
      value=""
      onChange={() => {}}
      onSend={(files) => void sent.push(files)}
      placeholder="Ask"
    />,
  );
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, {
    target: { files: [new File(["# hi"], "notes.md", { type: "text/markdown" })] },
  });
  expect(await screen.findByText("MD")).toBeTruthy();
  expect(posted).toEqual(["POST /api/files"]);

  // A file the server cannot read leaves again.
  fireEvent.change(input, { target: { files: [new File([new Uint8Array([0, 1])], "blob.bin")] } });
  await waitFor(() => expect(screen.queryByText("blob.bin")).toBeNull());

  // Files alone can be sent.
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(sent).toEqual([
    [{ type: "file", mediaType: "text/plain", filename: "notes.md", url: "/api/files/f1" }],
  ]);
  await waitFor(() => expect(screen.queryByText("notes.md")).toBeNull());
});
