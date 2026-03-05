FROM oven/bun:1.2.22 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.2.22 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1.2.22
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl && \
    arch="$(uname -m)" && \
    case "$arch" in \
      x86_64) docker_arch="x86_64" ;; \
      aarch64|arm64) docker_arch="aarch64" ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac && \
    curl -fsSL "https://download.docker.com/linux/static/stable/${docker_arch}/docker-26.1.4.tgz" -o /tmp/docker.tgz && \
    tar -xzf /tmp/docker.tgz -C /tmp && \
    mv /tmp/docker/docker /usr/local/bin/docker && \
    chmod +x /usr/local/bin/docker && \
    rm -rf /tmp/docker /tmp/docker.tgz /var/lib/apt/lists/*
COPY package.json bun.lock ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./src/db/migrations
CMD ["bun", "dist/src/index.js"]
