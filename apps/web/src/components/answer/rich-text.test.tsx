import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";

import { Notes } from "./blocks";
import { RichText } from "./rich-text";

afterEach(() => cleanup());

test("prose renders markdown inside typeset", () => {
  render(
    <RichText text={"Ship **today**. See `run.ts` and [the diff](https://example.com/diff)."} />,
  );

  const prose = document.querySelector(".typeset-chat");
  expect(prose?.className).toContain("typeset");
  expect(prose?.querySelector("strong")?.textContent).toBe("today");
  expect(prose?.querySelector("code")?.textContent).toBe("run.ts");
  const link = prose?.querySelector("a");
  expect(link?.getAttribute("href")).toBe("https://example.com/diff");
  expect(link?.getAttribute("rel")).toContain("noreferrer");
  expect(link?.getAttribute("target")).toBe("_blank");
  // Typeset styles the elements, not streamdown's own classes.
  expect(prose?.querySelector("p")?.getAttribute("class")).toBeNull();
});

test("markdown cut off mid-stream does not show raw markers", () => {
  render(<RichText text={"Ship **today"} streaming />);
  expect(document.querySelector(".typeset-chat strong")?.textContent).toBe("today");
  expect(document.querySelector(".typeset-chat")?.textContent).not.toContain("**");
});

test("emphasis that closes on CJK punctuation still renders", () => {
  render(<RichText text={"这是**“重点”**的内容。"} />);
  expect(document.querySelector(".typeset-chat strong")?.textContent).toBe("“重点”");
  expect(document.querySelector(".typeset-chat")?.textContent).not.toContain("**");
});

test("prose drops unsafe links", () => {
  render(<Notes title="Notes" items={["Click [here](javascript:alert(1))"]} />);
  expect(document.querySelector("a")).toBeNull();
  expect(document.querySelector(".typeset-chat")?.textContent).toContain("Click here");
});
