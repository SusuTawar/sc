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
