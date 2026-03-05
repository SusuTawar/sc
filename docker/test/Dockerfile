FROM golang:1.22-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o /usr/local/bin/servercommander ./cmd/server

EXPOSE 8080

CMD ["/usr/local/bin/servercommander", "serve"]
