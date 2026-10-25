import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { Welcome } from "./components/welcome";

afterEach(() => cleanup());

test("welcome offers GitHub on desktop and mobile, with no account form", () => {
  render(<Welcome onContinue={() => {}} />);
  expect(
    screen.getByRole("heading", { name: "Know or learn anything, or everything." }),
  ).toBeTruthy();
  expect(screen.getByText("Every model you already use, in one calm place.")).toBeTruthy();
  expect(
    screen.getByText("Bring the models you already use into one calm place to chat."),
  ).toBeTruthy();
  expect(document.querySelector("img")?.getAttribute("src")).toBe("/welcome-landscape.jpg");
  expect(screen.getByRole("button", { name: /Continue with GitHub/ })).toBeTruthy();
  expect(screen.queryByText(/Sign in with your account/i)).toBeNull();
  expect(screen.queryByText(/create account/i)).toBeNull();
  expect(screen.queryByLabelText(/password/i)).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
});

test("waiting for GitHub replaces the continue button", () => {
  render(<Welcome waiting onContinue={() => {}} />);
  expect(screen.getByRole("heading", { name: "Waiting for GitHub" })).toBeTruthy();
  expect(screen.getByText(/We opened your browser to finish signing in/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Open browser again" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Continue with GitHub/ })).toBeNull();
  expect(screen.queryByText(/Sign in with your account/i)).toBeNull();
});
