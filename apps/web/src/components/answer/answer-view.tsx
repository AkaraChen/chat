import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/core";
import { registry } from "./registry";

/** Renders a (possibly partial) json-render spec with the shared registry. */
export function AnswerView({ spec, loading }: { spec: Spec | null; loading?: boolean }) {
  if (!spec) return null;
  return (
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} loading={loading} />
    </JSONUIProvider>
  );
}
