import {
  flowRanks,
  type ComponentProps,
  type StructureBox,
} from "@my-better-t-app/api/views/catalog";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { RichText } from "./rich-text";
import { TONE_BOX } from "./tone";

const NODE_W = 136;
const LINE = 17;
const PAD_Y = 16;
const GAP_ACROSS = 20;
const GAP_ALONG = 44;
const LOOP = 36;

type Flow = ComponentProps["Flow"];
type FlowNode = Flow["nodes"][number];
type Placed = FlowNode & { x: number; y: number; w: number; h: number; rank: number };

// Rough line count of a label at 13px in a box NODE_W wide.
function nodeHeight(node: FlowNode) {
  const lines = Math.min(2, Math.ceil((node.label.length * 7) / (NODE_W - 24)));
  return PAD_Y + lines * LINE + (node.detail ? LINE : 0);
}

/** Places a flow's nodes in ranks, sorted to keep edges short. */
export function layoutFlow(flow: Flow) {
  const across: "x" | "y" = flow.direction === "right" ? "y" : "x";
  const ranks = flowRanks(flow);
  const byRank: FlowNode[][] = [];
  for (const node of flow.nodes) (byRank[ranks.get(node.id) ?? 0] ??= []).push(node);
  const rows = byRank.filter(Boolean);

  // One pass of barycentre ordering: a node sits under the mean slot of the
  // nodes that lead to it.
  const slot = new Map<string, number>();
  rows[0]?.forEach((node, index) => slot.set(node.id, index));
  for (const row of rows.slice(1)) {
    const score = (node: FlowNode) => {
      const from = flow.edges.filter((e) => e.to === node.id && slot.has(e.from));
      if (from.length === 0) return row.indexOf(node);
      return from.reduce((sum, e) => sum + slot.get(e.from)!, 0) / from.length;
    };
    row.sort((a, b) => score(a) - score(b));
    row.forEach((node, index) => slot.set(node.id, index));
  }

  const placed = new Map<string, Placed>();
  if (across === "x") {
    const widths = rows.map((row) => row.length * NODE_W + (row.length - 1) * GAP_ACROSS);
    const width = Math.max(...widths);
    let y = 0;
    rows.forEach((row, rank) => {
      const h = Math.max(...row.map(nodeHeight));
      let x = (width - widths[rank]!) / 2;
      for (const node of row) {
        placed.set(node.id, { ...node, x, y, w: NODE_W, h, rank });
        x += NODE_W + GAP_ACROSS;
      }
      y += h + GAP_ALONG;
    });
    return { placed, width, height: y - GAP_ALONG, across };
  }
  const heights = rows.map(
    (row) => row.reduce((sum, node) => sum + nodeHeight(node), 0) + (row.length - 1) * GAP_ACROSS,
  );
  const height = Math.max(...heights);
  rows.forEach((row, rank) => {
    let y = (height - heights[rank]!) / 2;
    for (const node of row) {
      const h = nodeHeight(node);
      placed.set(node.id, { ...node, x: rank * (NODE_W + GAP_ALONG), y, w: NODE_W, h, rank });
      y += h + GAP_ACROSS;
    }
  });
  return {
    placed,
    width: rows.length * (NODE_W + GAP_ALONG) - GAP_ALONG,
    height,
    across,
  };
}

function edgePath(a: Placed, b: Placed, across: "x" | "y") {
  const forward = b.rank > a.rank;
  if (across === "x") {
    if (forward) {
      const [x1, y1, x2, y2] = [a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y];
      const mid = (y1 + y2) / 2;
      return {
        d: `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`,
        lx: (x1 + x2) / 2,
        ly: mid,
      };
    }
    // Back to an earlier step: around the right-hand side.
    const [x1, y1, x2, y2] = [a.x + a.w, a.y + a.h / 2, b.x + b.w, b.y + b.h / 2];
    const out = Math.max(x1, x2) + LOOP;
    return {
      d: `M${x1},${y1} C${out},${y1} ${out},${y2} ${x2},${y2}`,
      lx: out - 8,
      ly: (y1 + y2) / 2,
    };
  }
  if (forward) {
    const [x1, y1, x2, y2] = [a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2];
    const mid = (x1 + x2) / 2;
    return { d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`, lx: mid, ly: (y1 + y2) / 2 };
  }
  const [x1, y1, x2, y2] = [a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y + b.h];
  const out = Math.max(y1, y2) + LOOP;
  return {
    d: `M${x1},${y1} C${x1},${out} ${x2},${out} ${x2},${y2}`,
    lx: (x1 + x2) / 2,
    ly: out - 8,
  };
}

/** Boxes and arrows, laid out here so the model never does coordinate maths. */
export function Flow(flow: Flow) {
  const marker = useId().replace(/:/g, "");
  const { placed, width, height, across } = layoutFlow(flow);
  const edges = flow.edges
    .map((edge) => {
      const a = placed.get(edge.from);
      const b = placed.get(edge.to);
      return a && b ? { ...edge, ...edgePath(a, b, across) } : null;
    })
    .filter((edge) => edge !== null);
  const loops = flow.edges.some(
    (e) => (placed.get(e.to)?.rank ?? 0) <= (placed.get(e.from)?.rank ?? 0),
  );
  const w = width + (loops && across === "x" ? LOOP + 8 : 0);
  const h = height + (loops && across === "y" ? LOOP + 8 : 0);
  return (
    <figure
      data-answer-card
      className="overflow-x-auto rounded-[12px] border border-line-quiet p-4"
    >
      <div className="relative mx-auto" style={{ width: w, height: h }}>
        <svg width={w} height={h} className="absolute inset-0 overflow-visible" aria-hidden="true">
          <defs>
            <marker
              id={marker}
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M1,1 L7,4 L1,7" fill="none" stroke="var(--line-strong)" strokeWidth="1.4" />
            </marker>
          </defs>
          {edges.map((edge, index) => (
            <path
              key={index}
              d={edge.d}
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth={1.4}
              markerEnd={`url(#${marker})`}
            />
          ))}
        </svg>
        {[...placed.values()].map((node) => (
          <div
            key={node.id}
            className={cn(
              "absolute flex flex-col justify-center rounded-[10px] border px-3",
              TONE_BOX[node.tone ?? "neutral"],
            )}
            style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
          >
            <span className="line-clamp-2 text-[13px] leading-[17px] font-medium text-ink">
              {node.label}
            </span>
            {node.detail ? (
              <span className="truncate text-xs leading-[17px] text-ink-secondary">
                {node.detail}
              </span>
            ) : null}
          </div>
        ))}
        {edges.map((edge, index) =>
          edge.label ? (
            <span
              key={index}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-paper px-1 text-xs text-ink-secondary"
              style={{ left: edge.lx, top: edge.ly }}
            >
              {edge.label}
            </span>
          ) : null,
        )}
      </div>
      <figcaption className="sr-only">
        {flow.edges
          .map((e) => `${placed.get(e.from)?.label} → ${placed.get(e.to)?.label}`)
          .join("; ")}
      </figcaption>
    </figure>
  );
}

function Box({ box, depth }: { box: StructureBox; depth: number }) {
  const children = box.children ?? [];
  const surface = depth % 2 === 0 ? "border-transparent bg-recessed" : "border-line-quiet bg-paper";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-[10px] border p-3",
        box.tone && box.tone !== "neutral" ? TONE_BOX[box.tone] : surface,
      )}
    >
      <div className="flex flex-col">
        <span className="text-[13px] font-medium text-ink">{box.label}</span>
        {box.detail ? <span className="text-xs text-ink-secondary">{box.detail}</span> : null}
      </div>
      {children.length ? (
        <div
          className={cn(
            "grid gap-2",
            children.length >= 2 && "sm:grid-cols-2",
            children.length >= 3 &&
              depth === 0 &&
              "md:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]",
          )}
        >
          {children.map((child, index) => (
            <Box key={`${child.label}-${index}`} box={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Boxes inside boxes. */
export function Structure({ root }: ComponentProps["Structure"]) {
  return (
    <figure data-answer-card>
      <Box box={root} depth={0} />
    </figure>
  );
}

function StepNumber({ n, active = true }: { n: number; active?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
        active ? "bg-accent-soft text-accent" : "bg-recessed text-ink-secondary",
      )}
    >
      {n}
    </span>
  );
}

/** Numbered stages: all at once, or one at a time. */
export function Steps({ steps, mode }: ComponentProps["Steps"]) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  if (mode !== "stepper") {
    return (
      <ol
        data-answer-card
        className="flex flex-col gap-4 rounded-[12px] border border-line-quiet p-4"
      >
        {steps.map((step, index) => (
          <li key={index} className="flex gap-3">
            <StepNumber n={index + 1} />
            <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
              <RichText text={step.title} className="text-sm font-medium text-ink" />
              <RichText text={step.detail} className="text-sm text-ink-secondary" />
            </div>
          </li>
        ))}
      </ol>
    );
  }
  const step = steps[Math.min(current, steps.length - 1)]!;
  const button =
    "rounded-lg border border-line-quiet px-3 py-1.5 text-sm text-ink hover:bg-recessed disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <section
      data-answer-card
      className="flex flex-col gap-4 rounded-[12px] border border-line-quiet p-4"
    >
      <div className="flex items-center gap-1.5" role="tablist">
        {steps.map((s, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={index === current}
            aria-label={s.title}
            onClick={() => setCurrent(index)}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              index <= current ? "bg-accent" : "bg-fill-strong",
            )}
          />
        ))}
      </div>
      <div className="flex min-h-24 gap-3" aria-live="polite">
        <StepNumber n={current + 1} />
        <div className="flex min-w-0 flex-col gap-1 pt-0.5">
          <RichText text={step.title} className="text-[15px] font-medium text-ink" />
          <RichText text={step.detail} className="text-sm text-ink-secondary" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-tertiary tabular-nums">
          {t("answer.stepOf", { current: current + 1, total: steps.length })}
        </span>
        <button
          type="button"
          className={cn(button, "ml-auto")}
          disabled={current === 0}
          onClick={() => setCurrent((n) => Math.max(0, n - 1))}
        >
          {t("answer.back")}
        </button>
        <button
          type="button"
          className={button}
          disabled={current === steps.length - 1}
          onClick={() => setCurrent((n) => Math.min(steps.length - 1, n + 1))}
        >
          {t("answer.next")}
        </button>
      </div>
    </section>
  );
}

function initials(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? words[0]![0]! + words[1]![0]! : [...title.trim()].slice(0, 2).join("");
  return letters.toUpperCase();
}

/** One bounded thing as a card of fields. */
export function RecordCard({ title, subtitle, fields }: ComponentProps["Record"]) {
  return (
    <section
      data-answer-card
      className="flex flex-col gap-4 rounded-[12px] border border-line-quiet p-4"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-medium text-accent"
        >
          {initials(title)}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-medium text-ink">{title}</span>
          {subtitle ? (
            <span className="truncate text-sm text-ink-secondary">{subtitle}</span>
          ) : null}
        </div>
      </div>
      <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-6 gap-y-2 text-sm">
        {fields.map((field, index) => (
          <div key={`${field.label}-${index}`} className="contents">
            <dt className="text-ink-secondary">{field.label}</dt>
            <dd className="min-w-0 text-ink">
              <RichText text={field.value} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
