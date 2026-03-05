# Setup Command

`servercommander setup` bootstraps the VPS with Docker, Caddy Docker Proxy, systemd service, firewall defaults, and required directories.

## Fresh Ubuntu 22 Host Bootstrap

If this is a brand-new VPS, run the host bootstrap script first:

```bash
sudo bash scripts/bootstrap-ubuntu22.sh
```

Optional environment overrides:

- `SSH_PORT=22` (default)
- `SWAP_MIN_RAM_GB=4` (create swap only when RAM is below this)
- `SWAP_SIZE_GB=2`
- `SWAP_FILE=/swapfile`

## Usage

```bash
sudo /opt/servercommander/servercommander setup
```

Flags:

- `--non-interactive`
- `--skip-firewall`
- `--skip-cloudflare-template`
- `--caddy-email <email>`
- `--write-env-template-only`

## Generated Files

- `/etc/servercommander/servercommander.env`
- `/etc/servercommander/Caddyfile`
- `/etc/systemd/system/servercommander.service`
- `/opt/servercommander`
- `/var/log/servercommander`

## Notes

- Run as root.
- Rerunning is safe and will not re-install Docker if already present.
- Deployments no longer run `docker pull`; images must be pre-loaded on the VPS (e.g., via `docker load`).
- To expose ServerCommander through Caddy, edit `/etc/servercommander/Caddyfile` and point it to your domain.
- If `caddy-proxy` already exists, remove it and rerun setup to mount the Caddyfile.
- After each deployment, ServerCommander keeps the 5 most recent image tags per environment and prunes older tags for the app's image repo (best-effort; images in use are not removed).

## Caddy + MySQL + PostgreSQL + Redis + Convex Dashboard (Docker)

Use this stack on a fresh host if you want Caddy and both databases via Docker:

```bash
cd docker/infra
cp .env.example .env
nano .env
docker compose pull
docker compose up -d --build
docker compose ps
```

Notes:

- MySQL and PostgreSQL are bound to `127.0.0.1` only by default.
- Redis is bound to `127.0.0.1` only by default.
- Convex dashboard is bound to `127.0.0.1` only by default.
- Change all default passwords in `.env` before starting.
- `servercommander` app also runs as a container in this stack.
- The app manages host Docker through `/var/run/docker.sock` mount.
- `caddy-proxy` auto-routes containers using Docker labels (`caddy`, `caddy.reverse_proxy`).
- If port `80/443` is already used (for example by `caddy-proxy`), stop/remove the conflicting container first.
- Redis from host: `redis://:<REDIS_PASSWORD>@127.0.0.1:<REDIS_PORT>/0`
- Redis from same Docker network: `redis://:<REDIS_PASSWORD>@redis:6379/0`

## CI Artifact Deploys (No Registry Pull)

If your CI exports Docker image artifacts and you deploy with `docker load`, follow:

- `docs/circleci-manual-image-upload.md`
- `docs/ci-webhook-api.md` (new direct webhook upload flow)

## TypeScript Service Local Development

```bash
cd docker/dev
docker compose up -d
```

## VPS Initialization (Step by Step)

1. Prepare VPS and clone repository:

```bash
sudo mkdir -p /opt
cd /opt
sudo git clone <YOUR_REPO_URL> servercommander
cd /opt/servercommander
```

2. Bootstrap Ubuntu host (update, firewall, swap-if-needed, Docker):

```bash
sudo bash scripts/bootstrap-ubuntu22.sh
```

3. Configure infra stack environment:

```bash
cd /opt/servercommander/docker/infra
cp .env.example .env
nano .env
```

Minimum required values to change in `.env`:

- `SC_PUBLIC_DOMAIN`
- `SC_WEBHOOK_SECRET`
- `SC_API_TOKEN`
- `SC_DISCORD_ENABLED` (`false` if you do not want Discord yet)
- `SC_DISCORD_BOT_TOKEN` (if Discord enabled)
- `SC_DISCORD_GUILD_ID` (if Discord enabled)
- `SC_DISCORD_OPERATOR_IDS` (if Discord enabled)
- `POSTGRES_PASSWORD`

4. Start the full stack:

```bash
cd /opt/servercommander/docker/infra
docker compose up -d --build
docker compose ps
```

Redis quick check:

```bash
docker compose exec redis sh -lc 'redis-cli -a "$REDIS_PASSWORD" ping'
```


5. Verify service is healthy:

```bash
curl http://127.0.0.1:8080/healthz
curl https://your-domain.com/healthz
docker compose logs -f servercommander
```

## After Running: How To Use It

1. Upload artifact from CI or manually.
Full contract and signing example:

- `docs/ci-webhook-api.md`

2. List uploaded artifacts (token required):

```bash
BASE_URL="https://your-domain.com"

curl -H "Authorization: Bearer <SC_API_TOKEN>" \
  "${BASE_URL}/v1/artifacts?app=myapp&env=staging&limit=10"
```

3. Deploy uploaded artifact via API:

```bash
curl -X POST "${BASE_URL}/v1/deployments/deploy" \
  -H "Authorization: Bearer <SC_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"app":"myapp","env":"staging","tag":"<tag>","domain":"app.example.com","internal_port":8080}'
```

4. Check deployment status:

```bash
curl -H "Authorization: Bearer <SC_API_TOKEN>" \
  "${BASE_URL}/v1/deployments/status?app=myapp&env=staging"
```

5. Lifecycle actions:

```bash
# restart
curl -X POST "${BASE_URL}/v1/deployments/restart" \
  -H "Authorization: Bearer <SC_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"app":"myapp","env":"staging"}'

# stop
curl -X POST "${BASE_URL}/v1/deployments/stop" \
  -H "Authorization: Bearer <SC_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"app":"myapp","env":"staging"}'

# delete
curl -X POST "${BASE_URL}/v1/deployments/delete" \
  -H "Authorization: Bearer <SC_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"app":"myapp","env":"staging"}'
```

6. If Discord is enabled, you can operate using slash commands:

- `docs/discord-commands.md`
