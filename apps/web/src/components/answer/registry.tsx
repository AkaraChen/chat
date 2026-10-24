import { defineRegistry } from "@json-render/react";
import { catalog } from "@my-better-t-app/api/templates/catalog";
import {
  Answer,
  Changes,
  Decisions,
  Diff,
  Notes,
  OpenItems,
  StatStrip,
  Table,
  Todo,
} from "./blocks";
import { LineChart } from "./line-chart";

/** json-render registry built from the shared catalog. */
export const { registry } = defineRegistry(catalog, {
  components: {
    Answer: ({ props, children }) => <Answer {...props}>{children}</Answer>,
    LineChart: ({ props }) => <LineChart {...props} />,
    StatStrip: ({ props }) => <StatStrip {...props} />,
    Table: ({ props }) => <Table {...props} />,
    Changes: ({ props }) => <Changes {...props} />,
    Diff: ({ props }) => <Diff {...props} />,
    Decisions: ({ props }) => <Decisions {...props} />,
    OpenItems: ({ props }) => <OpenItems {...props} />,
    Todo: ({ props }) => <Todo {...props} />,
    Notes: ({ props }) => <Notes {...props} />,
  },
});
