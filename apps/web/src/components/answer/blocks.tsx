import type { ComponentProps } from "@my-better-t-app/api/templates/catalog";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { FileTextIcon, GlobeIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { RichText } from "./rich-text";

function Card({ title, meta, children }: { title?: string; meta?: string; children: ReactNode }) {
  return (
    <section data-answer-card className="rounded-[12px] border border-line-quiet px-4 py-4">
      {title ? (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-[13px] text-ink-secondary">{title}</h3>
          {meta ? <span className="shrink-0 text-xs text-ink-secondary">{meta}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** The view under the prose: its cards, in reading order. */
export function Answer({ children }: { children?: ReactNode }) {
  return children ? <section className="flex flex-col gap-3">{children}</section> : null;
}

export function StatStrip({ cells }: ComponentProps["StatStrip"]) {
  return (
    <dl
      data-answer-card
      className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-[12px] border border-line-quiet px-4 py-4 sm:grid-cols-4"
    >
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col gap-1">
          <dt className="text-muted-foreground text-sm">{cell.label}</dt>
          <dd className="text-3xl font-semibold tracking-tight tabular-nums">{cell.value}</dd>
          <dd className="text-muted-foreground text-xs">{cell.compare}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ columns, rows }: ComponentProps["Table"]) {
  return (
    <div
      data-answer-card
      className="overflow-x-auto rounded-[12px] border border-line-quiet px-4 py-3"
    >
      <table className="w-full text-left text-sm tabular-nums">
        <thead>
          <tr className="text-muted-foreground">
            {columns.map((c) => (
              <th key={c} className="py-2 pr-6 font-normal last:pr-0">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="odd:bg-muted/50">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-6 first:pl-2 last:pr-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Changes({ files }: ComponentProps["Changes"]) {
  const { t } = useTranslation();
  return (
    <Card title={t("answer.changes")}>
      <ul className="flex flex-col gap-3">
        {files.map((f) => {
          const total = f.additions + f.deletions;
          const added = total === 0 ? 0 : (f.additions / total) * 100;
          return (
            <li key={f.path} className="flex items-center gap-4">
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{f.path}</span>
              <span className="flex gap-2 font-mono text-xs tabular-nums">
                <span className="text-add">+{f.additions}</span>
                <span className="text-remove">-{f.deletions}</span>
              </span>
              <span
                aria-hidden="true"
                className="flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-remove/30"
              >
                <span className="h-full bg-add" style={{ width: `${added}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function Diff({ file, startLine, note, patch }: ComponentProps["Diff"]) {
  const { t } = useTranslation();
  let line = startLine;
  const rows = patch.split("\n").map((text) => {
    const mark = text[0] === "+" || text[0] === "-" ? text[0] : " ";
    const number = mark === "-" ? null : line++;
    return { mark, number, body: text.slice(1) };
  });
  return (
    <Card title={t("answer.diff")}>
      <figure className="flex flex-col gap-3">
        <figcaption className="flex flex-col gap-1">
          <span className="font-mono text-sm">{file}</span>
          <RichText text={note} className="text-muted-foreground text-sm" />
        </figcaption>
        <pre className="bg-muted/60 overflow-x-auto rounded-xl py-2 font-mono text-xs/relaxed">
          <code className="block min-w-max">
            {rows.map((r, i) => (
              <span
                key={i}
                className={
                  "flex px-3 " + (r.mark === "+" ? "text-add" : r.mark === "-" ? "text-remove" : "")
                }
              >
                <span className="text-muted-foreground w-8 shrink-0 pr-3 text-right select-none tabular-nums">
                  {r.number ?? ""}
                </span>
                <span className="w-4 shrink-0 select-none">{r.mark === " " ? "" : r.mark}</span>
                <span className="whitespace-pre">{r.body}</span>
              </span>
            ))}
          </code>
        </pre>
      </figure>
    </Card>
  );
}

export function Decisions({ items }: ComponentProps["Decisions"]) {
  const { t } = useTranslation();
  return (
    <Card title={t("answer.decisions")}>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-ink">
            <span aria-hidden="true" className="mt-1 text-accent">
              ✓
            </span>
            <RichText text={item} className="min-w-0 flex-1" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function OpenItems({ groups }: ComponentProps["OpenItems"]) {
  const { t } = useTranslation();
  return (
    <Card title={t("answer.stillOpen")}>
      <div className="grid gap-6 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-3">
            <h4 className="text-sm font-medium text-ink">{group.title}</h4>
            <div className="flex flex-col gap-2">
              {group.cards.map((card) => (
                <div
                  key={card.title}
                  className="flex flex-col gap-0.5 rounded-xl bg-recessed px-4 py-3"
                >
                  <RichText text={card.title} className="text-sm font-medium text-ink" />
                  <RichText text={card.detail} className="text-sm text-ink-secondary" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Todo({ person, task, time }: ComponentProps["Todo"]) {
  const { t } = useTranslation();
  return (
    <Card title={t("answer.todo")}>
      <div data-block="todo" className="flex items-baseline gap-3 text-sm">
        <span className="w-20 shrink-0 truncate font-medium text-ink">{person}</span>
        <RichText text={task} className="min-w-0 flex-1 text-sm text-ink" />
        <span className="shrink-0 text-ink-secondary">{time}</span>
      </div>
    </Card>
  );
}

export function Notes({ title, items }: ComponentProps["Notes"]) {
  return (
    <Card title={title}>
      <ul className="flex flex-col gap-1.5 text-sm text-ink-secondary">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="text-accent">
              •
            </span>
            <RichText text={item} className="min-w-0 flex-1 text-sm text-ink-secondary" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CheckMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
      <path
        d="M2.4 6.2 4.7 8.5 9.6 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Options({ title, options }: ComponentProps["Options"]) {
  const { t } = useTranslation();
  return (
    <Card title={title} meta={t("answer.optionCount", { count: options.length })}>
      <div className={cn("grid gap-2", options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {options.map((option) => (
          <div
            key={option.name}
            className={cn(
              "flex flex-col gap-1 rounded-[10px] border p-2.5",
              option.recommended
                ? "border-accent-line bg-accent-soft"
                : "border-transparent bg-recessed",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink">{option.name}</span>
              {option.recommended ? (
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
                  <CheckMark />
                  {t("answer.recommended")}
                </span>
              ) : null}
            </div>
            <RichText text={option.summary} className="text-xs text-ink-secondary" />
            <span className="mt-auto pt-0.5 text-xs font-medium text-ink">{option.meta}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Comparison({ title, columns, rows }: ComponentProps["Comparison"]) {
  const { t } = useTranslation();
  return (
    <Card title={title} meta={t("answer.criteriaCount", { count: rows.length })}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col />
            {columns.map((_, index) => (
              <col key={index} className={columns.length === 3 ? "w-[26%]" : "w-[32%]"} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th />
              {columns.map((column, index) => (
                <th key={index} className="pb-2 pl-3 text-left align-bottom font-medium">
                  <span className="flex items-center gap-1.5">
                    {column.recommended ? (
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-accent"
                      />
                    ) : null}
                    <span
                      className={cn(
                        "text-xs",
                        column.recommended ? "text-ink" : "text-ink-secondary",
                      )}
                    >
                      {column.name}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.criterion}-${index}`} className="border-t border-line-quiet">
                <th
                  scope="row"
                  className="py-2 pr-3 text-left align-top text-sm font-normal text-ink-secondary"
                >
                  <RichText text={row.criterion} />
                </th>
                {row.values.map((value, valueIndex) => (
                  <td
                    key={valueIndex}
                    className="py-2 pl-3 align-top text-sm text-ink tabular-nums"
                  >
                    <RichText text={value} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const STATUS_TEXT = {
  negative: "text-remove",
  neutral: "text-ink-secondary",
  positive: "text-add",
} as const;

const STATUS_DOT = {
  negative: "bg-remove",
  neutral: "bg-ink-tertiary",
  positive: "bg-add",
} as const;

// A short value sits at the right of its label. One too long to fit there
// wraps onto a line of its own and reads left to right.
export function Rows({ title, meta, rows }: ComponentProps["Rows"]) {
  return (
    <Card title={title} meta={meta}>
      <dl className="flex flex-col text-sm">
        {rows.map((row, index) => (
          <div
            key={`${row.label}-${index}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line-quiet py-2"
          >
            <dt className="min-w-0 flex-[1_0_10rem] text-ink">
              <RichText text={row.label} />
            </dt>
            <dd
              className={cn(
                "ml-auto flex max-w-full min-w-0 items-center gap-1.5 text-xs font-medium",
                row.status ? STATUS_TEXT[row.status] : "text-ink-secondary",
              )}
            >
              {row.status ? (
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[row.status])}
                />
              ) : null}
              <RichText text={row.value} className="min-w-0" />
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function Sources({ title, items }: ComponentProps["Sources"]) {
  const { t } = useTranslation();
  return (
    <Card title={title} meta={t("answer.checkedCount", { count: items.length })}>
      <ul className="flex flex-col">
        {items.map((item, index) => (
          <li
            key={`${item.title}-${index}`}
            className="flex items-center gap-2.5 border-t border-line-quiet py-2"
          >
            {item.kind === "file" ? (
              <FileTextIcon aria-hidden="true" size={14} className="shrink-0 text-ink-tertiary" />
            ) : (
              <GlobeIcon aria-hidden="true" size={14} className="shrink-0 text-ink-tertiary" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.title}</span>
            <span className="shrink-0 font-mono text-xs text-ink-secondary">{item.source}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
