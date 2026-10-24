import { tool, type Tool } from "ai";
import { z } from "zod";

const API = "https://api.github.com";
// Keeps a huge PR from eating the model's context.
export const MAX_DIFF_CHARS = 60_000;
const MAX_COMMENT_CHARS = 1_000;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const input = z.object({
  owner: z.string().describe("Repository owner"),
  repo: z.string().describe("Repository name"),
  number: z.number().int().positive().describe("Pull request number"),
});

type PullInput = z.infer<typeof input>;

const JSON_ACCEPT = "application/vnd.github+json";

function createClient(token: string, fetchImpl: Fetch) {
  const headers = (accept: string): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "chat",
  });

  async function check(res: Response): Promise<Response> {
    if (!res.ok) throw new Error(`GitHub ${res.status} ${res.statusText}`.trim());
    return res;
  }

  return {
    async json<T>(path: string): Promise<T> {
      const res = await check(await fetchImpl(`${API}${path}`, { headers: headers(JSON_ACCEPT) }));
      return (await res.json()) as T;
    },
    async text(path: string, accept: string): Promise<string> {
      return (await check(await fetchImpl(`${API}${path}`, { headers: headers(accept) }))).text();
    },
    async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
      const res = await check(
        await fetchImpl(`${API}/graphql`, {
          method: "POST",
          headers: { ...headers(JSON_ACCEPT), "Content-Type": "application/json" },
          body: JSON.stringify({ query, variables }),
        }),
      );
      const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
      if (body.errors?.length || !body.data) {
        throw new Error(body.errors?.[0]?.message ?? "GitHub GraphQL returned no data");
      }
      return body.data;
    },
  };
}

const base = ({ owner, repo, number }: PullInput) => `/repos/${owner}/${repo}/pulls/${number}`;

type PullRequest = {
  title: string;
  body: string | null;
  state: string;
  draft?: boolean;
  merged?: boolean;
  user?: { login: string } | null;
  base: { ref: string };
  head: { ref: string; sha: string };
  additions?: number;
  deletions?: number;
  changed_files?: number;
  html_url: string;
};

type PullFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

type CheckRuns = {
  total_count: number;
  check_runs: {
    name: string;
    status: string;
    conclusion: string | null;
    html_url: string | null;
  }[];
};

const FAILED = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure"]);

const THREADS_QUERY = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          path
          comments(first: 20) { nodes { author { login } body } }
        }
      }
    }
  }
}`;

type ThreadsData = {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: {
          isResolved: boolean;
          path: string | null;
          comments: { nodes: { author: { login: string } | null; body: string }[] };
        }[];
      };
    } | null;
  } | null;
};

export const githubToolIds = [
  "get_pull_request",
  "get_pull_request_files",
  "get_pull_request_diff",
  "get_pull_request_checks",
  "list_pull_request_comments",
] as const;

export type GithubToolId = (typeof githubToolIds)[number];

// Deferred: the model sees only tool_search at first and loads these by
// searching, so a turn without a pull request does not carry them.
export function githubTools({
  token,
  fetch: fetchImpl = fetch,
}: {
  token: string;
  fetch?: Fetch;
}): Record<GithubToolId, Tool> {
  const gh = createClient(token, fetchImpl);

  return {
    get_pull_request: tool({
      deferLoading: true,
      description: "Fetch a GitHub pull request: title, description, author, branches and totals.",
      inputSchema: input,
      async execute(args) {
        const pr = await gh.json<PullRequest>(base(args));
        return {
          detail: { repo: `${args.owner}/${args.repo}`, number: args.number },
          title: pr.title,
          body: pr.body ?? "",
          state: pr.merged ? "merged" : pr.state,
          draft: pr.draft ?? false,
          author: pr.user?.login ?? null,
          base: pr.base.ref,
          head: pr.head.ref,
          additions: pr.additions ?? null,
          deletions: pr.deletions ?? null,
          changedFiles: pr.changed_files ?? null,
          url: pr.html_url,
        };
      },
    }),

    get_pull_request_files: tool({
      deferLoading: true,
      description:
        "List the files changed in a pull request with per-file additions and deletions.",
      inputSchema: input,
      async execute(args) {
        const files = await gh.json<PullFile[]>(`${base(args)}/files?per_page=100`);
        return {
          detail: { repo: `${args.owner}/${args.repo}`, number: args.number, files: files.length },
          files: files.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
          })),
        };
      },
    }),

    get_pull_request_diff: tool({
      deferLoading: true,
      description: "Read the unified diff of a pull request. Large diffs are truncated.",
      inputSchema: input,
      async execute(args) {
        const full = await gh.text(base(args), "application/vnd.github.diff");
        let additions = 0;
        let deletions = 0;
        for (const line of full.split("\n")) {
          if (line.startsWith("+") && !line.startsWith("+++")) additions++;
          else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
        }
        const truncated = full.length > MAX_DIFF_CHARS;
        return {
          detail: { additions, deletions },
          truncated,
          diff: truncated ? full.slice(0, MAX_DIFF_CHARS) : full,
        };
      },
    }),

    get_pull_request_checks: tool({
      deferLoading: true,
      description: "Get the CI check runs for the head commit of a pull request.",
      inputSchema: input,
      async execute(args) {
        const pr = await gh.json<PullRequest>(base(args));
        const sha = pr.head.sha;
        const runs = await gh.json<CheckRuns>(
          `/repos/${args.owner}/${args.repo}/commits/${sha}/check-runs?per_page=100`,
        );
        const failed = runs.check_runs.filter((r) => r.conclusion && FAILED.has(r.conclusion));
        return {
          detail: { failed: failed.length },
          sha,
          total: runs.total_count,
          checks: runs.check_runs.map((r) => ({
            name: r.name,
            status: r.status,
            conclusion: r.conclusion,
            url: r.html_url,
          })),
        };
      },
    }),

    list_pull_request_comments: tool({
      deferLoading: true,
      description: "List review threads on a pull request and how many are still unresolved.",
      inputSchema: input,
      async execute(args) {
        const data = await gh.graphql<ThreadsData>(THREADS_QUERY, {
          owner: args.owner,
          repo: args.repo,
          number: args.number,
        });
        const pr = data.repository?.pullRequest;
        if (!pr) throw new Error("Pull request not found");
        const threads = pr.reviewThreads.nodes;
        return {
          detail: { unresolved: threads.filter((t) => !t.isResolved).length },
          threads: threads.map((t) => ({
            resolved: t.isResolved,
            path: t.path,
            comments: t.comments.nodes.map((c) => ({
              author: c.author?.login ?? null,
              body: c.body.slice(0, MAX_COMMENT_CHARS),
            })),
          })),
        };
      },
    }),
  };
}

// Without a token the tools are simply absent from the model's tool set.
export function githubToolsFor(
  token: string | null,
  fetchImpl?: Fetch,
): Partial<Record<GithubToolId, Tool>> {
  return token ? githubTools({ token, fetch: fetchImpl }) : {};
}
