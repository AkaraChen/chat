import { Spinner } from "../spinner";

export type TraceStep = {
  tool: string;
  status: "running" | "done" | "error";
  detail?: Record<string, string | number | undefined>;
};

type Copy = {
  label: (d: NonNullable<TraceStep["detail"]>) => string;
  right?: (d: NonNullable<TraceStep["detail"]>) => string;
};

const COPY: Record<string, Copy> = {
  search_templates: { label: () => "Found a template", right: (d) => String(d.template ?? "") },
  get_pull_request: { label: () => "Fetched the pull request" },
  get_pull_request_files: {
    label: (d) => `Opened ${d.repo ?? ""} #${d.number ?? ""}`,
    right: (d) => (d.files == null ? "" : `${d.files} ${Number(d.files) === 1 ? "file" : "files"}`),
  },
  get_pull_request_diff: {
    label: () => "Read the diff",
    right: (d) => (d.additions == null ? "" : `+${d.additions} -${d.deletions ?? 0}`),
  },
  get_pull_request_checks: {
    label: () => "Checked CI",
    right: (d) => (d.failed == null ? "" : `${d.failed} failed`),
  },
  list_pull_request_comments: {
    label: () => "Collected comments",
    right: (d) => (d.unresolved == null ? "" : `${d.unresolved} unresolved`),
  },
};

function Mark({ status }: { status: TraceStep["status"] }) {
  if (status === "running") return <Spinner size={14} />;
  if (status === "error") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        aria-hidden="true"
        className="text-destructive"
      >
        <path
          d="M3.5 3.5l7 7M10.5 3.5l-7 7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="text-[#1a73e8]">
      <path
        d="M2.75 7.25l2.75 2.75 5.75-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Step bar for the tools that really ran. Renders nothing without steps. */
export function Trace({ steps }: { steps: TraceStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="flex flex-col gap-1.5 text-sm">
      {steps.map((step, i) => {
        const copy = COPY[step.tool];
        const detail = step.detail ?? {};
        const label = copy ? copy.label(detail) : step.tool;
        const right = step.status === "error" ? "" : (copy?.right?.(detail) ?? "");
        return (
          <li key={`${step.tool}-${i}`} className="flex items-center gap-2.5">
            <Mark status={step.status} />
            <span className={step.status === "running" ? "text-muted-foreground" : undefined}>
              {step.status === "error" ? `${label} failed` : label}
            </span>
            {right ? (
              <span className="text-muted-foreground ml-auto tabular-nums">{right}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
