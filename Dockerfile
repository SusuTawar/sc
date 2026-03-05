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
    ca-certificates docker.io && \
    rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./src/db/migrations
CMD ["bun", "dist/src/index.js"]
