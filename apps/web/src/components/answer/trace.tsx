import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "../spinner";

export type TraceStep = {
  tool: string;
  status: "running" | "done" | "error";
  detail?: Record<string, string | number | undefined>;
};

type Detail = NonNullable<TraceStep["detail"]>;

type Copy = {
  label: (t: TFunction, d: Detail) => string;
  right?: (t: TFunction, d: Detail) => string;
};

const COPY: Record<string, Copy> = {
  search_templates: {
    label: (t) => t("trace.foundTemplate"),
    right: (_, d) => String(d.template ?? ""),
  },
  get_pull_request: { label: (t) => t("trace.fetchedPullRequest") },
  get_pull_request_files: {
    label: (t, d) => t("trace.openedPullRequest", { repo: d.repo ?? "", number: d.number ?? "" }),
    right: (t, d) => (d.files == null ? "" : t("trace.file", { count: Number(d.files) })),
  },
  get_pull_request_diff: {
    label: (t) => t("trace.readDiff"),
    right: (_, d) => (d.additions == null ? "" : `+${d.additions} -${d.deletions ?? 0}`),
  },
  get_pull_request_checks: {
    label: (t) => t("trace.checkedCi"),
    right: (t, d) => (d.failed == null ? "" : t("trace.failedCount", { count: Number(d.failed) })),
  },
  list_pull_request_comments: {
    label: (t) => t("trace.collectedComments"),
    right: (t, d) =>
      d.unresolved == null ? "" : t("trace.unresolved", { count: Number(d.unresolved) }),
  },
};

const GROUP = {
  meeting: "trace.sortedMeeting",
  review: "trace.reviewedDiff",
  economy: "trace.chartedFigures",
  "tech-choice": "trace.weighedOptions",
  "capability-check": "trace.checkedDocs",
} as const;

function Mark({ status }: { status: TraceStep["status"] }) {
  const { t } = useTranslation();
  const label =
    status === "running"
      ? t("trace.running")
      : status === "error"
        ? t("trace.failed")
        : t("trace.done");
  return (
    <span role="img" aria-label={label} className="inline-flex">
      {status === "running" ? (
        <Spinner size={14} />
      ) : status === "error" ? (
        <ErrorMark />
      ) : (
        <DoneMark />
      )}
    </span>
  );
}

function ErrorMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="text-warn">
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
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="text-accent">
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

function labelOf(t: TFunction, step: TraceStep) {
  const detail = step.detail ?? {};
  const copy = COPY[step.tool];
  const label = copy ? copy.label(t, detail) : step.tool;
  return step.status === "error" ? t("trace.stepFailed", { label }) : label;
}

function templateLabel(t: TFunction, status: TraceStep["status"]) {
  if (status === "running") return t("trace.findingTemplate");
  if (status === "error") return t("trace.findingTemplateFailed");
  return t("trace.foundTemplate");
}

function groupStatus(steps: TraceStep[]): TraceStep["status"] {
  if (steps.some((step) => step.status === "running")) return "running";
  if (steps.some((step) => step.status === "error")) return "error";
  return "done";
}

function rightOf(t: TFunction, step: TraceStep) {
  if (step.status === "error") return "";
  const detail = step.detail ?? {};
  const copy = COPY[step.tool];
  if (copy?.right) return copy.right(t, detail);
  const values = Object.values(detail).filter((value) => value != null && value !== "");
  return values.length ? values.join(" ") : "";
}

function prettyTemplate(value: string) {
  if (!value) return "";
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

const TEMPLATE_NAME: Record<string, string> = {
  "tech-choice": "Tech choice",
  "capability-check": "Capability check",
};

function templateNameOf(value: string) {
  return TEMPLATE_NAME[value] ?? prettyTemplate(value);
}

/** Collapsible step list. The template row starts closed; the work group starts open. */
export function Trace({ steps }: { steps: TraceStep[] }) {
  const { t } = useTranslation();
  const template = steps.find((step) => step.tool === "search_templates");
  const rest = steps.filter((step) => step !== template);
  const templateName = templateNameOf(String(template?.detail?.template ?? ""));
  const group = GROUP[String(template?.detail?.template ?? "") as keyof typeof GROUP];
  const groupTitle = group ? t(group) : t("trace.steps");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(true);
  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 text-sm text-ink">
      {template ? (
        <div>
          <button
            type="button"
            aria-expanded={templateOpen}
            onClick={() => setTemplateOpen((open) => !open)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span aria-hidden="true" className="w-3 text-ink-tertiary">
              {templateOpen ? "▾" : "›"}
            </span>
            <Mark status={template.status} />
            <span className="text-ink-secondary">{templateLabel(t, template.status)}</span>
            <span className="ml-auto text-ink-tertiary">{templateName}</span>
          </button>
          {templateOpen ? (
            <p className="pt-1 pl-5 text-ink-secondary">
              {t("trace.usingTemplate", { name: templateName || t("trace.matching") })}
            </p>
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
            <span aria-hidden="true" className="w-3 text-ink-tertiary">
              {groupOpen ? "▾" : "›"}
            </span>
            <Mark status={groupStatus(rest)} />
            <span>{groupTitle}</span>
            <span className="ml-auto text-ink-tertiary">
              {t("trace.stepCount", { count: rest.length })}
            </span>
          </button>
          {groupOpen ? (
            <ol className="mt-1.5 flex flex-col gap-1.5 pl-8">
              {rest.map((step, index) => {
                const right = rightOf(t, step);
                return (
                  <li key={`${step.tool}-${index}`} className="flex items-center gap-2.5">
                    <Mark status={step.status} />
                    <span className={step.status === "running" ? "text-ink-secondary" : undefined}>
                      {labelOf(t, step)}
                    </span>
                    {right ? (
                      <span className="ml-auto text-ink-tertiary tabular-nums">{right}</span>
                    ) : null}
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
