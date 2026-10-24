import { useState } from "react";

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

const GROUP: Record<string, string> = {
  meeting: "Sorted the meeting",
  review: "Reviewed the diff",
  economy: "Charted the figures",
};

function Mark({ status }: { status: TraceStep["status"] }) {
  const label = status === "running" ? "Running" : status === "error" ? "Failed" : "Done";
  return (
    <span role="img" aria-label={label} className="inline-flex">
      {status === "running" ? <Spinner size={14} /> : status === "error" ? <ErrorMark /> : <DoneMark />}
    </span>
  );
}

function ErrorMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="text-[#C2410C]">
      <path
        d="M3.5 3.5l7 7M10.5 3.5l-7 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DoneMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="text-[#1A73E8]">
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

function labelOf(step: TraceStep) {
  const detail = step.detail ?? {};
  const copy = COPY[step.tool];
  const label = copy ? copy.label(detail) : step.tool;
  return step.status === "error" ? `${label} failed` : label;
}

function templateLabel(status: TraceStep["status"]) {
  if (status === "running") return "Finding a template";
  if (status === "error") return "Finding a template failed";
  return "Found a template";
}

function groupStatus(steps: TraceStep[]): TraceStep["status"] {
  if (steps.some((step) => step.status === "running")) return "running";
  if (steps.some((step) => step.status === "error")) return "error";
  return "done";
}

function rightOf(step: TraceStep) {
  if (step.status === "error") return "";
  const detail = step.detail ?? {};
  const copy = COPY[step.tool];
  if (copy?.right) return copy.right(detail);
  const values = Object.values(detail).filter((value) => value != null && value !== "");
  return values.length ? values.join(" ") : "";
}

function prettyTemplate(value: string) {
  if (!value) return "";
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

/** Collapsible step list. The template row starts closed; the work group starts open. */
export function Trace({ steps }: { steps: TraceStep[] }) {
  const template = steps.find((step) => step.tool === "search_templates");
  const rest = steps.filter((step) => step !== template);
  const templateName = prettyTemplate(String(template?.detail?.template ?? ""));
  const groupTitle = GROUP[String(template?.detail?.template ?? "")] ?? "Steps";
  const [templateOpen, setTemplateOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(true);
  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 text-sm text-[#1C1C1E]">
      {template ? (
        <div>
          <button
            type="button"
            aria-expanded={templateOpen}
            onClick={() => setTemplateOpen((open) => !open)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span aria-hidden="true" className="w-3 text-[#9E9EA4]">
              {templateOpen ? "▾" : "›"}
            </span>
            <Mark status={template.status} />
            <span className="text-[#6E6E73]">{templateLabel(template.status)}</span>
            <span className="ml-auto text-[#9E9EA4]">{templateName}</span>
          </button>
          {templateOpen ? (
            <p className="pt-1 pl-5 text-[#6E6E73]">Using the {templateName || "matching"} template.</p>
          ) : null}
        </div>
      ) : null}
      {rest.length > 0 ? (
        <div>
          <button
            type="button"
            aria-expanded={groupOpen}
            onClick={() => setGroupOpen((open) => !open)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span aria-hidden="true" className="w-3 text-[#9E9EA4]">
              {groupOpen ? "▾" : "›"}
            </span>
            <Mark status={groupStatus(rest)} />
            <span>{groupTitle}</span>
            <span className="ml-auto text-[#9E9EA4]">
              {rest.length} {rest.length === 1 ? "step" : "steps"}
            </span>
          </button>
          {groupOpen ? (
            <ol className="mt-1.5 flex flex-col gap-1.5 pl-8">
              {rest.map((step, index) => {
                const right = rightOf(step);
                return (
                  <li key={`${step.tool}-${index}`} className="flex items-center gap-2.5">
                    <Mark status={step.status} />
                    <span className={step.status === "running" ? "text-[#6E6E73]" : undefined}>
                      {labelOf(step)}
                    </span>
                    {right ? <span className="ml-auto text-[#9E9EA4] tabular-nums">{right}</span> : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
