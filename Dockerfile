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

FROM alpine:3.23
RUN apk add --no-cache ca-certificates tzdata && addgroup -g 10001 chat && adduser -D -u 10001 -G chat chat
WORKDIR /app
COPY --from=service /out/chatthing /app/chatthing
COPY --from=frontend /src/web/dist /app/web/dist
COPY LICENSE NOTICE.md /app/
ENV CHATTHING_ADDR=0.0.0.0:8080 CHATTHING_ASSETS=/app/web/dist CHATTHING_ENV_FILE=/app/no-env-file
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -T 3 -O /dev/null http://127.0.0.1:8080/api/health || exit 1
ENTRYPOINT ["/app/chatthing"]
