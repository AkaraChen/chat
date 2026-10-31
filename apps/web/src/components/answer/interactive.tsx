import { calc, formatNumber } from "@my-better-t-app/api/views/calc";
import type { ComponentProps } from "@my-better-t-app/api/views/catalog";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { useId, type ReactNode } from "react";

import { LineChart } from "./line-chart";

// The renderer resolves every expression before a component sees its props,
// so what arrives is plain values, whatever the catalog type allows.
type Resolved<T> = { [K in keyof T]: T[K] extends object ? Resolved<T[K]> : T[K] } & {};
type Bound<T> = { value: T | undefined; onChange: (next: T) => void };

/** Holds an interactive view: controls, then what they change. */
export function Panel({ title, children }: ComponentProps["Panel"] & { children?: ReactNode }) {
  return (
    <section
      data-answer-card
      className="flex flex-col gap-5 rounded-[12px] border border-line-quiet p-4"
    >
      {title ? <h3 className="text-[13px] text-ink-secondary">{title}</h3> : null}
      {children}
    </section>
  );
}

export function Slider({
  label,
  min,
  max,
  step,
  unit,
  precision,
  value,
  onChange,
}: Omit<ComponentProps["Slider"], "value"> & Bound<number>) {
  const id = useId();
  const current = typeof value === "number" ? value : Number(value ?? min);
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-32 shrink-0 text-sm text-ink-secondary">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(current) ? current : min}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
      />
      <output
        htmlFor={id}
        className="w-20 shrink-0 text-right text-sm font-medium text-ink tabular-nums"
      >
        {formatNumber(current, precision ?? 0, unit)}
      </output>
    </div>
  );
}

export function Toggle({
  label,
  value,
  onChange,
}: Omit<ComponentProps["Toggle"], "checked"> & Bound<boolean>) {
  const on = Boolean(value);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex items-center gap-3 self-start text-sm text-ink-secondary"
    >
      <span
        className={cn(
          "flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
          on ? "bg-accent" : "bg-fill-strong",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-thumb shadow-sm transition-transform",
            on && "translate-x-4",
          )}
        />
      </span>
      {label}
    </button>
  );
}

export function Choice({
  label,
  options,
  value,
  onChange,
}: Omit<ComponentProps["Choice"], "value"> & Bound<string>) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-32 shrink-0 text-sm text-ink-secondary">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex rounded-lg bg-recessed p-0.5"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-3 py-1 text-sm transition-colors",
              option.value === value
                ? "bg-paper text-ink shadow-[var(--elevation-chip)]"
                : "text-ink-secondary hover:text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Live numbers, rounded here whatever the arithmetic produced. */
export function Readouts({ items }: Resolved<ComponentProps["Readouts"]>) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-1">
          <dt className="text-sm text-ink-secondary">{String(item.label ?? "")}</dt>
          <dd className="text-2xl font-medium tracking-tight text-ink tabular-nums">
            {formatNumber(item.value, item.precision ?? 0, item.unit)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A formula drawn as a line: each series is evaluated at evenly spaced x. */
export function Plot({ title, unit, x, series, precision }: Resolved<ComponentProps["Plot"]>) {
  const from = Number(x.from);
  const to = Number(x.to);
  const samples = Math.max(2, Math.min(60, Math.round(x.samples)));
  const xs = Array.from({ length: samples }, (_, i) => from + ((to - from) * i) / (samples - 1));
  const span = Math.abs(to - from);
  const xPrecision = span >= samples ? 0 : span >= samples / 10 ? 1 : 2;
  const lines = series.map((s) => ({
    name: s.name,
    points: xs.map((value) => ({
      x: formatNumber(value, xPrecision),
      y: calc(s.expr, { ...s.vars, x: value }),
    })),
  }));
  return (
    <LineChart
      title={title}
      unit={x.label ? `${unit} · ${x.label}` : unit}
      series={lines}
      precision={precision ?? 0}
      bare
    />
  );
}
