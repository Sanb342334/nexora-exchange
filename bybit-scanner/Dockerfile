# Build
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

COPY go.mod ./
COPY go.sum* ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o scanner ./cmd/scanner

# Runtime
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/scanner .
COPY config.yaml .

RUN mkdir -p /app/logs && chmod 755 /app/logs

ENV LOG_DIR=/app/logs
ENV CONFIG_PATH=/app/config.yaml

CMD ["./scanner"]
