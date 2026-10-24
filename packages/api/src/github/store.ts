import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

// The token lives in its own file, apart from the credential store. Only
// `get` is safe to expose to the browser; `read` is for server-side tools.
export function createGithubStore(file: string) {
  async function read(): Promise<string | null> {
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      return null;
    }
    try {
      const value = JSON.parse(raw) as { token?: unknown };
      return typeof value.token === "string" && value.token ? value.token : null;
    } catch {
      return null;
    }
  }

  return {
    async get(): Promise<boolean> {
      return (await read()) !== null;
    },
    read,
    async save(token: string): Promise<void> {
      const dir = path.dirname(file);
      await mkdir(dir, { recursive: true, mode: DIR_MODE });
      await chmod(dir, DIR_MODE);
      await writeFile(file, JSON.stringify({ token: token.trim() }), { mode: FILE_MODE });
      await chmod(file, FILE_MODE);
    },
    async clear(): Promise<void> {
      await rm(file, { force: true });
    },
  };
}

export type GithubStore = ReturnType<typeof createGithubStore>;
