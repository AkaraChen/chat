# Build context is the repo root, like apps/web/Dockerfile.
FROM oven/bun:1
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
ENV PROXY_HOST=0.0.0.0
EXPOSE 8317
WORKDIR /app/apps/proxy
CMD ["bun", "src/index.ts"]
