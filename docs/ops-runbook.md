# Ops Runbook

## Prerequisites

- Docker installed on VPS.
- `caddy-docker-proxy` container running on network `edge`.
- PostgreSQL reachable by `SC_DB_DSN`.
- `SC_API_TOKEN` configured for `/v1/deployments/*` and `/v1/artifacts`.
- Bot token, guild ID, operator IDs configured (or set `SC_DISCORD_ENABLED=false`).

## First-Time Setup

```bash
sudo mkdir -p /opt
cd /opt
sudo git clone <YOUR_REPO_URL> servercommander
cd /opt/servercommander
sudo bash scripts/bootstrap-ubuntu22.sh
cd docker/infra
cp .env.example .env
nano .env
docker compose up -d --build
```

After start:

```bash
curl http://127.0.0.1:8080/healthz
curl https://your-domain.com/healthz
docker compose ps
```

## Local Dev

```bash
cd docker/dev
cp ../../.env.example ../../.env
docker compose up -d
```

This starts:
- PostgreSQL (`5432`)
- Redis (`6379`)
- Service in watch mode (`8080`)

## Production Container Logs

```bash
cd docker/infra
docker compose logs -f servercommander
```

## Redis Check

```bash
cd docker/infra
docker compose exec redis sh -lc 'redis-cli -a "$REDIS_PASSWORD" ping'
```

## Convex Dashboard Check

```bash
cd docker/infra
docker compose logs --tail=100 convex-dashboard
```

## Deployment Lifecycle

1. CircleCI uploads artifact via webhook.
2. Service verifies HMAC + timestamp and replay guard.
3. Service runs `docker load`.
4. Artifact marked `ready`.
5. Retention keeps only last 5 per app+env.
6. Deploy command runs/replaces `sc-{app}-{env}` container.

## Day-1 Usage (API)

1. Upload artifact using webhook (`docs/ci-webhook-api.md`).
2. List artifacts:

```bash
BASE_URL="https://your-domain.com"

curl -H "Authorization: Bearer <SC_API_TOKEN>" \
  "${BASE_URL}/v1/artifacts?app=myapp&env=staging&limit=10"
```

3. Deploy artifact:

```bash
curl -X POST "${BASE_URL}/v1/deployments/deploy" \
  -H "Authorization: Bearer <SC_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"app":"myapp","env":"staging","tag":"<tag>","domain":"app.example.com","internal_port":8080}'
```

4. Check status:

```bash
curl -H "Authorization: Bearer <SC_API_TOKEN>" \
  "${BASE_URL}/v1/deployments/status?app=myapp&env=staging"
```

## Troubleshooting

### Signature mismatch

- Ensure signature is computed from the documented canonical payload in `docs/ci-webhook-api.md`.
- Ensure server and CI clocks are synchronized.

### Replay detected

- Duplicate request/signature within replay TTL.
- Re-send with a new timestamp and recomputed signature.

### `docker load` failure

- Validate artifact file (`tar`/`tar.gz`).
- Verify Docker daemon health: `docker info`.

### Deploy failed

- Check logs: `/deployment-logs app env`.
- Inspect container directly: `docker logs sc-{app}-{env}`.

### Domain not routing

- Verify labels on container:
  - `caddy=<domain>`
  - `caddy.reverse_proxy={{upstreams <internal_port>}}`
- Ensure caddy proxy is connected to same Docker network (`edge`).
