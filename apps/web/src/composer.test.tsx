import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";

import { Composer } from "./components/chat/composer";
import { GeneralPanel } from "./components/chat/settings/general";
import { renderApp } from "./test-harness";

afterEach(() => {
  localStorage.removeItem("the-chat-preferences");
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
