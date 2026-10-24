import type { ComponentProps } from "@my-better-t-app/api/templates/catalog";
import type { ReactNode } from "react";

export function Answer({
  lead,
  source,
  children,
}: ComponentProps["Answer"] & { children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-xl leading-snug font-medium text-balance">{lead}</p>
        {source ? <p className="text-muted-foreground text-sm">{source}</p> : null}
      </div>
      {children ? (
        <div className="flex flex-col gap-8 [&>[data-block=todo]+[data-block=todo]]:-mt-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function StatStrip({ cells }: ComponentProps["StatStrip"]) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
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
    <div className="overflow-x-auto">
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
  return (
    <ul className="flex flex-col gap-3">
      {files.map((f) => {
        const total = f.additions + f.deletions;
        const added = total === 0 ? 0 : (f.additions / total) * 100;
        return (
          <li key={f.path} className="flex items-center gap-4">
            <span className="min-w-0 flex-1 truncate font-mono text-sm">{f.path}</span>
            <span className="flex gap-2 font-mono text-xs tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span>
              <span className="text-red-600 dark:text-red-400">-{f.deletions}</span>
            </span>
            <span
              aria-hidden="true"
              className="flex h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-red-500/70"
            >
              <span className="h-full bg-emerald-500" style={{ width: `${added}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Diff({ file, startLine, note, patch }: ComponentProps["Diff"]) {
  let line = startLine;
  const rows = patch.split("\n").map((text) => {
    const mark = text[0] === "+" || text[0] === "-" ? text[0] : " ";
    const number = mark === "-" ? null : line++;
    return { mark, number, body: text.slice(1) };
  });
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <span className="font-mono text-sm">{file}</span>
        <span className="text-muted-foreground text-sm">{note}</span>
      </figcaption>
      <pre className="bg-muted/60 overflow-x-auto rounded-xl py-2 font-mono text-xs/relaxed">
        <code className="block min-w-max">
          {rows.map((r, i) => (
            <span
              key={i}
              className={
                "flex px-3 " +
                (r.mark === "+" ? "bg-emerald-500/15" : r.mark === "-" ? "bg-red-500/15" : "")
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
  );
}

export function Decisions({ items }: ComponentProps["Decisions"]) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-base">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-[#1a73e8]" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function OpenItems({ groups }: ComponentProps["OpenItems"]) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{group.title}</h3>
          <div className="flex flex-col gap-2">
            {group.cards.map((card) => (
              <div
                key={card.title}
                className="bg-muted/60 flex flex-col gap-0.5 rounded-xl px-4 py-3"
              >
                <span className="text-sm font-medium">{card.title}</span>
                <span className="text-muted-foreground text-sm">{card.detail}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Todo({ person, task, time }: ComponentProps["Todo"]) {
  return (
    <div data-block="todo" className="flex items-baseline gap-3 text-sm">
      <span className="w-20 shrink-0 truncate font-medium">{person}</span>
      <span className="min-w-0 flex-1">{task}</span>
      <span className="text-muted-foreground shrink-0">{time}</span>
    </div>
  );
}

export function Notes({ title, items }: ComponentProps["Notes"]) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="text-muted-foreground flex flex-col gap-1.5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
