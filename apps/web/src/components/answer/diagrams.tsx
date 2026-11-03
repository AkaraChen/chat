import { type ComponentProps, type StructureBox } from "@my-better-t-app/api/views/catalog";
import { drawable } from "@my-better-t-app/api/views/diagram";
import { cn } from "@my-better-t-app/ui/lib/utils";
import type { Mounted } from "pele/lazy";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { RichText } from "./rich-text";
import { TONE_BOX } from "./tone";

/**
 * Mermaid source, drawn by pele (https://pele.run). pele's drawing code, and
 * the parser for each type, load the first time a diagram needs them. The
 * layout follows the column's width, and a diagram shrunk to fit can be zoomed.
 */
export function Diagram({ source }: ComponentProps["Diagram"]) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const text = drawable(source);
    let mounted: Mounted | undefined;
    let gone = false;
    setFailed(false);
    import("pele/lazy")
      .then(async ({ detectType, load, mount }) => {
        await load(detectType(text));
        if (gone) return;
        mounted = mount(element, text, {
          fontSize: 14,
          links: false,
          images: false,
          zoom: {
            labels: {
              zoomIn: t("answer.zoomIn"),
              zoomOut: t("answer.zoomOut"),
              reset: t("answer.zoomReset"),
            },
          },
          onError: () => setFailed(true),
        });
      })
      .catch(() => {
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
      mounted?.destroy();
      element.replaceChildren();
    };
  }, [source, t]);
  // The server drops a diagram pele cannot draw, so this only covers one
  // still streaming in. Like any view that fails, it leaves the prose alone.
  return (
    <figure
      data-answer-card
      hidden={failed}
      className="diagram rounded-[12px] border border-line-quiet p-4"
    >
      <div ref={ref} />
    </figure>
  );
}

type Flow = ComponentProps["Flow"];

const quoted = (text: string) => `"${text.replace(/"/g, "#quot;")}"`;

/** An older answer's nodes and edges, as Mermaid for pele to draw. */
export function flowSource(flow: Flow) {
  const ids = new Map(flow.nodes.map((node, index) => [node.id, `n${index}`]));
  const lines = [`flowchart ${flow.direction === "right" ? "LR" : "TD"}`];
  for (const node of flow.nodes) {
    const label = node.detail ? `${node.label}<br/>${node.detail}` : node.label;
    const tone = node.tone && node.tone !== "neutral" ? `:::${node.tone}` : "";
    lines.push(`  ${ids.get(node.id)}[${quoted(label)}]${tone}`);
  }
  for (const edge of flow.edges) {
    const label = edge.label ? `|${quoted(edge.label)}|` : "";
    lines.push(`  ${ids.get(edge.from)} -->${label} ${ids.get(edge.to)}`);
  }
  return lines.join("\n");
}

/** Boxes and arrows from an older answer, drawn the same way as a Diagram. */
export function Flow(flow: Flow) {
  return <Diagram source={flowSource(flow)} />;
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
