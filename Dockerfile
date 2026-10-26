# One image for the whole app: the web server, the model proxy and the
# thread-title worker. deploy/start.sh runs all three. Kamal builds this file.
# The proxy's CLIProxyAPI binary comes from @cpajs/cpa's platform package,
# which bun install picks for this image's OS and libc.

FROM node:24 AS app
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
# Varlock refuses to build unless every required value is set, so these
# placeholders satisfy that check. Every value is dynamic (@defaultDynamic in
# the schema), so none of them reaches the output; the real values are read
# when the container starts.
RUN export NODE_ENV=production DATABASE_URL=file:/tmp/build.db CREDENTIALS_DIR=/tmp \
      GITHUB_TOKEN_FILE=/tmp/github.json MODELS_DEV_CACHE_FILE=/tmp/models-dev.json \
      PROXY_API_KEY=build BETTER_AUTH_SECRET=build \
      GITHUB_CLIENT_ID=build GITHUB_CLIENT_SECRET=build && \
    bun run db:generate && \
    cd apps/web && bun run build

FROM node:24-slim
# The slim image has no system CA bundle. Node carries its own, but
# CLIProxyAPI needs the system one to reach model providers over TLS. Prisma wants
# openssl.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
COPY --from=app /app /app
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
EXPOSE 3001
CMD ["/app/deploy/start.sh"]
