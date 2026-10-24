import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { Answer, Notes } from "./blocks";

afterEach(() => cleanup());

test("answer prose renders markdown inside typeset", () => {
  render(
    <Answer
      lead={"Ship **today**. See `run.ts` and [the diff](https://example.com/diff)."}
      source="AkaraChen/chat#128"
    />,
  );

  const lead = document.querySelector(".typeset-chat");
  expect(lead?.className).toContain("typeset");
  expect(lead?.querySelector("strong")?.textContent).toBe("today");
  expect(lead?.querySelector("code")?.textContent).toBe("run.ts");
  const link = lead?.querySelector("a");
  expect(link?.getAttribute("href")).toBe("https://example.com/diff");
  expect(link?.getAttribute("rel")).toContain("noreferrer");
  expect(link?.getAttribute("target")).toBe("_blank");
  expect(screen.getByText("AkaraChen/chat#128")).toBeTruthy();
  expect(lead?.className).toContain("[&>p:first-child]:text-xl");
});

test("prose drops unsafe links", () => {
  render(<Notes title="Notes" items={["Click [here](javascript:alert(1))"]} />);
  expect(document.querySelector("a")).toBeNull();
  expect(document.querySelector(".typeset-chat")?.textContent).toContain("Click here");
});
