# AGENTS.md

## Project

`chat` — a monorepo scaffolded with
[Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).
The web app is TanStack Start and the mobile app is Expo (bare React Native).
There is no separate backend: the API is oRPC served by the web app. Data is
SQLite through Prisma. Package manager is Bun, and Vite+ (`vp`) runs tasks,
lint, and format.

```
apps/web/       TanStack Start
apps/native/    Expo (bare)
packages/api/   oRPC procedures
packages/db/    Prisma schema and client
packages/ui/    Shared shadcn/ui primitives
packages/config Shared TypeScript config
```

## Commands

Run from the repo root.

| Command               | What it does                                |
| --------------------- | ------------------------------------------- |
| `bun run dev`         | Start every app                             |
| `bun run dev:web`     | Web only, http://localhost:3001             |
| `bun run dev:native`  | Expo dev server                             |
| `bun run check`       | Vite+ lint/format plus TypeScript           |
| `bun run lint`        | Lint only                                   |
| `bun run format`      | Format only                                 |
| `bun run db:generate` | Generate the Prisma client                  |
| `bun run db:push`     | Apply the schema (creates `.data/local.db`) |
| `bun run db:studio`   | Prisma Studio                               |

Generate the Prisma client before typechecking or building, and again after
any schema change. From `apps/native`, the `ios` and `android` scripts build
and launch the app.

## Conventions

- Formatting and linting belong to Vite+ (`vp`), not Biome. Run `bun run check`
  instead of hand-formatting.
- Each app owns its environment schema in `.env.schema`. Varlock generates
  `src/env.ts` on install; run `bun run env:generate` after editing a schema.
  Commit schemas, not secrets.
- Shared UI primitives live in `packages/ui` and are imported as
  `@my-better-t-app/ui/components/*`. Add more with
  `npx shadcn@latest add <name> -c packages/ui`.
- `bts.jsonc` records the stack. Keep it so
  `bunx create-better-t-stack@latest add` can add to the project later.

## Design principles

The UI is system-native, so it should look like the platform: not a concept,
not a wireframe.

- Restraint. A screen that is already tight does not get another element. When
  in doubt, remove.
- No divider lines and no eyebrows. Grouping comes from space and type, not a
  rule or a small label above a block.
- Space follows relationship. Related things sit close; the next group gets
  more air. Do not space everything evenly.
- A control looks like a control, not a sentence ("‹ Back to …").
- Use the real brand mark, large enough to read, taken from
  [lobe-icons](https://github.com/lobehub/lobe-icons). Do not invent one and do
  not substitute a letter.
- One accent, and it is blue. Primary actions are not black.
- Imagery that sets the tone runs to the edge, including under the safe area.
  Do not float it as a card. Anything placed on top of it stays readable.
- Do not add chrome a screen does not need.
