import { formatNumber } from "@my-better-t-app/api/views/calc";
import type { ComponentProps } from "@my-better-t-app/api/views/catalog";
import { cn } from "@my-better-t-app/ui/lib/utils";

const COLORS = ["bg-accent", "bg-line-strong"] as const;

/** Horizontal bars: a label, a bar per series, and the value. */
export function BarChart({
  title,
  unit,
  categories,
  series,
  precision,
}: ComponentProps["BarChart"]) {
  const largest = Math.max(...series.flatMap((s) => s.values.map(Math.abs)), 0) || 1;
  return (
    <figure
      data-answer-card
      className="flex flex-col gap-4 rounded-[12px] border border-line-quiet px-4 py-4"
    >
      <figcaption className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-ink-secondary">{unit}</span>
        {series.length > 1 ? (
          <span className="ml-auto flex gap-3 text-xs">
            {series.map((s, i) => (
              <span key={s.name} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", COLORS[i])} />
                {s.name}
              </span>
            ))}
          </span>
        ) : null}
      </figcaption>
      <dl className="grid grid-cols-[minmax(4rem,8rem)_1fr] items-center gap-x-3 gap-y-2.5">
        {categories.map((category, index) => (
          <div key={`${category}-${index}`} className="contents">
            <dt className="truncate text-sm text-ink-secondary" title={category}>
              {category}
            </dt>
            <dd className="flex flex-col gap-1">
              {series.map((s, i) => {
                const value = s.values[index] ?? 0;
                return (
                  <span key={s.name} className="flex items-center gap-2">
                    <span
                      className={cn("h-2.5 rounded-full", value < 0 ? "bg-remove" : COLORS[i])}
                      style={{ width: `${(Math.abs(value) / largest) * 85}%` }}
                    />
                    <span className="text-xs text-ink tabular-nums">
                      {formatNumber(value, precision ?? 0)}
                    </span>
                  </span>
                );
              })}
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
