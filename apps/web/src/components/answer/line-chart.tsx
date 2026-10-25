import type { ComponentProps } from "@my-better-t-app/api/templates/catalog";

type Props = ComponentProps["LineChart"];

const W = 640;
const H = 200;
const PAD = { top: 12, right: 44, bottom: 24, left: 8 };

function format(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** Hand-written SVG line chart. Series 1 is the blue accent, series 2 is neutral. */
export function LineChart({ title, unit, series }: Props) {
  const labels = series[0]?.points.map((p) => p.x) ?? [];
  const values = series.flatMap((s) => s.points.map((p) => p.y));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const lo = min - span * 0.1;
  const hi = max + span * 0.1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number, n: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;
  const colors = ["var(--accent)", "var(--line-strong)"];

  return (
    <figure
      data-answer-card
      className="flex flex-col gap-3 rounded-[12px] border border-line-quiet px-4 py-4"
    >
      <figcaption className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted-foreground text-xs">{unit}</span>
        <span className="ml-auto flex gap-3 text-xs">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span
                className={
                  i === 0 ? "size-2 rounded-full bg-accent" : "size-2 rounded-full bg-line-strong"
                }
              />
              {s.name}
            </span>
          ))}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        className="h-auto w-full overflow-visible"
      >
        {series.map((s, si) => {
          const n = s.points.length;
          const color = colors[si] ?? colors[1];
          const last = s.points[n - 1];
          return (
            <g key={s.name} className={si === 0 ? undefined : "text-muted-foreground"}>
              <polyline
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={s.points.map((p, i) => `${x(i, n)},${y(p.y)}`).join(" ")}
              />
              {last ? (
                <>
                  <circle cx={x(n - 1, n)} cy={y(last.y)} r={3.5} fill={color} />
                  <text
                    x={x(n - 1, n) + 8}
                    y={y(last.y)}
                    dominantBaseline="central"
                    fontSize={12}
                    fill="currentColor"
                    className="fill-current"
                  >
                    {format(last.y)}
                  </text>
                </>
              ) : null}
            </g>
          );
        })}
        {labels.map((label, i) => (
          <text
            key={`${label}-${i}`}
            x={x(i, labels.length)}
            y={H - 4}
            fontSize={12}
            textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
            className="fill-muted-foreground"
          >
            {label}
          </text>
        ))}
      </svg>
    </figure>
  );
}
