FROM golang:1.23-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o dsa-api ./main.go

FROM alpine:latest

# Pythonとビルドツールをインストール
RUN apk --no-cache add \
    ca-certificates \
    python3 \
    py3-pip \
    python3-dev \
    gcc \
    g++ \
    musl-dev \
    linux-headers \
    make \
    cmake \
    llvm-dev \
    llvm-static \
    libffi-dev \
    openssl-dev \
    bash

WORKDIR /app

COPY --from=builder /app/dsa-api .
COPY entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

EXPOSE 8080

# 起動スクリプトでPython依存関係をインストールしてからアプリを起動
CMD ["/app/entrypoint.sh"]
