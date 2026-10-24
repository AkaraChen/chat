FROM golang:1.26 AS builder
WORKDIR /src

# Build context is the repo root, like apps/web/Dockerfile.
COPY apps/proxy/go.mod apps/proxy/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY apps/proxy/ ./
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/proxy .

FROM gcr.io/distroless/static-debian12
COPY --from=builder /out/proxy /proxy
ENV PROXY_HOST=0.0.0.0
EXPOSE 8317
ENTRYPOINT ["/proxy"]
