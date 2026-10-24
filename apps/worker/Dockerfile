FROM oven/bun:1
WORKDIR /app

COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install
RUN bun run db:generate

ENV NODE_ENV=production
WORKDIR /app/apps/worker
CMD ["bun", "src/index.ts"]
