import type { ComponentProps } from "@my-better-t-app/api/templates/catalog";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { RichText } from "./rich-text";

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section data-answer-card className="rounded-[12px] border border-[#E3E3E7] px-4 py-4">
      {title ? <h3 className="mb-3 text-[13px] text-[#6E6E73]">{title}</h3> : null}
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
      className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-[12px] border border-[#E3E3E7] px-4 py-4 sm:grid-cols-4"
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
      className="overflow-x-auto rounded-[12px] border border-[#E3E3E7] px-4 py-3"
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
                <span className="text-[#1B7F4E]">+{f.additions}</span>
                <span className="text-[#A33B3B]">-{f.deletions}</span>
              </span>
              <span
                aria-hidden="true"
                className="flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[#A33B3B]/30"
              >
                <span className="h-full bg-[#1B7F4E]" style={{ width: `${added}%` }} />
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
                  "flex px-3 " +
                  (r.mark === "+" ? "text-[#1B7F4E]" : r.mark === "-" ? "text-[#A33B3B]" : "")
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
          <li key={item} className="flex items-start gap-2.5 text-[#1C1C1E]">
            <span aria-hidden="true" className="mt-1 text-[#1A73E8]">
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
            <h4 className="text-sm font-medium text-[#1C1C1E]">{group.title}</h4>
            <div className="flex flex-col gap-2">
              {group.cards.map((card) => (
                <div
                  key={card.title}
                  className="flex flex-col gap-0.5 rounded-xl bg-[#F7F7F9] px-4 py-3"
                >
                  <RichText text={card.title} className="text-sm font-medium text-[#1C1C1E]" />
                  <RichText text={card.detail} className="text-sm text-[#6E6E73]" />
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
        <span className="w-20 shrink-0 truncate font-medium text-[#1C1C1E]">{person}</span>
        <RichText text={task} className="min-w-0 flex-1 text-sm text-[#1C1C1E]" />
        <span className="shrink-0 text-[#6E6E73]">{time}</span>
      </div>
    </Card>
  );
}

export function Notes({ title, items }: ComponentProps["Notes"]) {
  return (
    <Card title={title}>
      <ul className="flex flex-col gap-1.5 text-sm text-[#6E6E73]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="text-[#1A73E8]">
              •
            </span>
            <RichText text={item} className="min-w-0 flex-1 text-sm text-[#6E6E73]" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
