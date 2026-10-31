import { defineRegistry, useBoundProp } from "@json-render/react";
import { calc, formatNumber } from "@my-better-t-app/api/views/calc";
import { catalog } from "@my-better-t-app/api/views/catalog";

import { BarChart } from "./bar-chart";
import {
  Answer,
  Changes,
  Comparison,
  Decisions,
  Diff,
  Notes,
  OpenItems,
  Options,
  Rows,
  Sources,
  StatStrip,
  Table,
  Todo,
} from "./blocks";
import { Flow, RecordCard, Steps, Structure } from "./diagrams";
import { FollowUps } from "./follow-ups";
import { Choice, Panel, Plot, Readouts, Slider, Toggle } from "./interactive";
import { LineChart } from "./line-chart";

/** json-render registry built from the shared catalog. */
export const { registry } = defineRegistry(catalog, {
  components: {
    Answer: ({ props, children }) => <Answer {...props}>{children}</Answer>,
    LineChart: ({ props }) => <LineChart {...props} />,
    BarChart: ({ props }) => <BarChart {...props} />,
    StatStrip: ({ props }) => <StatStrip {...props} />,
    Table: ({ props }) => <Table {...props} />,
    Changes: ({ props }) => <Changes {...props} />,
    Diff: ({ props }) => <Diff {...props} />,
    Decisions: ({ props }) => <Decisions {...props} />,
    OpenItems: ({ props }) => <OpenItems {...props} />,
    Todo: ({ props }) => <Todo {...props} />,
    Notes: ({ props }) => <Notes {...props} />,
    Options: ({ props }) => <Options {...props} />,
    Comparison: ({ props }) => <Comparison {...props} />,
    Rows: ({ props }) => <Rows {...props} />,
    Sources: ({ props }) => <Sources {...props} />,
    Flow: ({ props }) => <Flow {...props} />,
    Structure: ({ props }) => <Structure {...props} />,
    Steps: ({ props }) => <Steps {...props} />,
    Record: ({ props }) => <RecordCard {...props} />,
    FollowUps: ({ props }) => <FollowUps {...props} />,
    Panel: ({ props, children }) => <Panel {...props}>{children}</Panel>,
    Slider: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<number>(props.value as never, bindings?.value);
      return <Slider {...props} value={value} onChange={setValue} />;
    },
    Toggle: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<boolean>(props.checked as never, bindings?.checked);
      return <Toggle {...props} value={value} onChange={setValue} />;
    },
    Choice: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string>(props.value as never, bindings?.value);
      return <Choice {...props} value={value} onChange={setValue} />;
    },
    Readouts: ({ props }) => <Readouts {...(props as Parameters<typeof Readouts>[0])} />,
    Plot: ({ props }) => <Plot {...(props as Parameters<typeof Plot>[0])} />,
  },
});

/** What `$computed` may call. Both are plain functions of their arguments. */
export const functions = {
  calc: (args: Record<string, unknown>) =>
    calc(typeof args.expr === "string" ? args.expr : "", args),
  format: (args: Record<string, unknown>) =>
    formatNumber(args.value, Number(args.precision ?? 0), String(args.unit ?? "")),
};
