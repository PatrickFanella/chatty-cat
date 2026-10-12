# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.27.2-alpine AS service
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags='-s -w' -o /out/chatthing ./cmd/chatthing
COPY --from=frontend /src/web/src web/src
COPY --from=frontend /src/web/public web/public
COPY --from=frontend /src/web/index.html /src/web/package.json /src/web/package-lock.json /src/web/tsconfig.json /src/web/tsconfig.sw.json /src/web/vite.config.ts /src/web/vitest.config.ts web/
COPY LICENSE NOTICE.md README.md Dockerfile compose.yaml .dockerignore .go-version ./
COPY scripts/ scripts/
COPY deploy/ deploy/
COPY docs/architecture.md docs/architecture.md
RUN tar -czf /out/source.tar.gz cmd internal web/src web/public web/index.html web/package.json web/package-lock.json web/tsconfig.json web/tsconfig.sw.json web/vite.config.ts web/vitest.config.ts go.mod go.sum LICENSE NOTICE.md README.md Dockerfile compose.yaml .dockerignore .go-version scripts deploy docs/architecture.md

FROM alpine:3.23
RUN apk add --no-cache ca-certificates tzdata && addgroup -g 10001 chat && adduser -D -u 10001 -G chat chat
WORKDIR /app
COPY --from=service /out/chatthing /app/chatthing
COPY --from=frontend /src/web/dist /app/web/dist
COPY --from=service /out/source.tar.gz /app/web/dist/source.tar.gz
COPY LICENSE NOTICE.md /app/
ENV CHATTHING_ADDR=0.0.0.0:8080 CHATTHING_ASSETS=/app/web/dist CHATTHING_ENV_FILE=/app/no-env-file
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -T 3 -O /dev/null http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["/app/chatthing"]
