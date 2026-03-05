# Discord Commands (TypeScript Service)

All commands are operator-only. Operator IDs come from `SC_DISCORD_OPERATOR_IDS`.

## Artifact

- `/artifact-list app env limit`
  - Lists uploaded artifacts for one app + env.

## Deploy

- `/deploy-uploaded app env tag`
  - Deploys a previously uploaded artifact tag.

- `/deploy-init app env tag domain internal_port`
  - Deploys artifact tag and writes caddy-docker-proxy labels for custom domain routing.

- `/deploy-restart app env`
  - Restarts active container `sc-{app}-{env}`.

- `/deploy-stop app env`
  - Stops active container `sc-{app}-{env}`.

- `/deploy-delete app env`
  - Removes active container `sc-{app}-{env}`.

## Status / Logs

- `/deployment-status app env`
  - Shows deployment status, image ref, and domain.

- `/deployment-logs app env lines`
  - Tails Docker logs for the current deployment container.

## Convex

- Requires `SC_CONVEX_*` settings (see `docker/infra/.env.example`).

- `/convex init appname`
  - Creates a Convex backend instance named `sc-convex-{appname}`.
  - `appname` becomes the subdomain: `{appname}.{SC_CONVEX_DOMAIN_SUFFIX}`.

- `/convex adminkey appname`
  - Prints the admin key by running `./generate_admin_key.sh` inside the container.

- `/convex remove appname`
  - Removes the Convex container and its data volume (`sc_convex_{appname}`).

- `/convex list`
  - Lists all Convex instances by Docker label.
