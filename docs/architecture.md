# Architecture (TypeScript)

## Components

1. Fastify API server
   - CI upload webhook
   - Artifact and deployment APIs
2. PostgreSQL + Drizzle
   - app metadata
   - artifact history
   - deployment state
   - replay guard
3. Docker runtime adapter
   - `docker load`
   - run/restart/stop/delete containers
   - image prune for retention
4. Discord bot (`discord.js`)
   - operator-only slash commands
5. Caddy Docker Proxy integration
   - labels on deployed containers for custom domain routing

## Data Flow

1. CI sends artifact upload to webhook.
2. Service verifies HMAC + timestamp and replay protection.
3. Service stores artifact temp file, loads image, records metadata.
4. Retention prunes old images (keep 5 per app+env).
5. Deploy API/Discord action starts or replaces app container.
6. Deployment state and actions are written to PostgreSQL.
