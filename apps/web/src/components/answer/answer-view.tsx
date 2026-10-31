import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/core";

import { functions, registry } from "./registry";

/** Renders one (possibly partial) json-render view with the shared registry. */
export function AnswerView({ spec, loading }: { spec: Spec | null; loading?: boolean }) {
  if (!spec) return null;
  // Each view keeps its own state: the controls of one never move another.
  return (
    <JSONUIProvider registry={registry} initialState={spec.state} functions={functions}>
      <Renderer spec={spec} registry={registry} loading={loading} />
    </JSONUIProvider>
  );
}
