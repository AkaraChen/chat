import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const src = import.meta.dir;

function source(path: string) {
  return readFileSync(join(src, path), "utf8");
}

test("retired account, header, and connect screens are not reachable", () => {
  expect(existsSync(join(src, "routes/sign-in.tsx"))).toBe(false);
  expect(existsSync(join(src, "routes/sign-up.tsx"))).toBe(false);
  expect(existsSync(join(src, "components/header.tsx"))).toBe(false);
  expect(existsSync(join(src, "components/chat/settings/github-block.tsx"))).toBe(false);
  expect(existsSync(join(src, "components/chat/settings/key-form.tsx"))).toBe(false);

  const connect = source("routes/_member.connect.$.tsx");
  const connected = source("routes/_member.connected.tsx");
  expect(connect).toContain("redirect");
  expect(connected).toContain("redirect");
  expect(connect).not.toContain("Use an API key");
  expect(connected).not.toContain("Use an API key");

  const providers = source("components/chat/settings/providers.tsx");
  expect(providers).not.toContain("Personal access token");
  expect(providers).not.toContain("GithubBlock");

  const session = source("session.ts");
  expect(session).toContain('to: "/"');
  expect(session).not.toContain("/sign-in");

  const tree = source("routeTree.gen.ts");
  expect(tree).not.toContain("sign-in");
  expect(tree).not.toContain("sign-up");

  const index = source("routes/index.tsx");
  expect(index).not.toContain("Sign in with your account");
  expect(index).not.toContain("/sign-in");
});
