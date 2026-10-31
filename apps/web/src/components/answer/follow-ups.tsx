import type { ComponentProps } from "@my-better-t-app/api/views/catalog";

import { useAsk } from "./ask";

/** Next questions. Each sends its prompt as the user's message; a shared page has none. */
export function FollowUps({ items }: ComponentProps["FollowUps"]) {
  const ask = useAsk();
  if (ask === undefined) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <button
          key={index}
          type="button"
          disabled={ask === null}
          onClick={() => ask?.(item.prompt)}
          className="flex items-center gap-1.5 rounded-full border border-line-quiet px-3 py-1.5 text-sm text-ink transition-colors hover:bg-recessed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          {item.label}
          <span aria-hidden="true" className="text-ink-tertiary">
            ↗
          </span>
        </button>
      ))}
    </div>
  );
}
