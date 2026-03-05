# CI Webhook API

## Endpoint

- `POST /v1/ci/artifacts/upload`

## Headers

- `X-SC-Timestamp`: unix seconds
- `X-SC-Signature`: `sha256=<hex(hmac(secret, canonical_payload))>`
- `X-SC-Source` (optional): defaults to `circleci`

`canonical_payload` is:

```text
timestamp
source
app
env
tag
image_repo
artifact_sha256
domain
init_deploy
internal_port
```

Use empty string for missing optional fields (`domain`, `init_deploy`, `internal_port`).

## Multipart Fields

- `app` (required)
- `env` (required): `dev|staging|prod|main` (`main` maps to `prod`)
- `tag` (required)
- `image_repo` (required)
- `artifact` (required): `.tar` or `.tar.gz`
- `domain` (optional): used for init deploy
- `init_deploy` (optional): `true|false`
- `internal_port` (optional): used for init deploy

## Response

```json
{
  "artifact_id": 123,
  "app": "billing-api",
  "env": "staging",
  "image_ref": "myorg/billing-api:abc123",
  "docker_image_id": "sha256:...",
  "retention": {
    "kept": 5,
    "pruned": 1,
    "skipped_in_use": 0
  },
  "deployment_id": 999
}
```

`deployment_id` is present only when `init_deploy=true`.

## CircleCI Example

```bash
#!/usr/bin/env bash
set -euo pipefail

API_URL="https://your-host/v1/ci/artifacts/upload"
SECRET="${SC_WEBHOOK_SECRET}"
APP="billing-api"
ENV="staging"
TAG="${CIRCLE_SHA1}"
IMAGE_REPO="myorg/billing-api"
ARTIFACT="billing-api-${CIRCLE_SHA1}.tar.gz"

TIMESTAMP="$(date +%s)"
SOURCE="circleci"
DOMAIN=""
INIT_DEPLOY=""
INTERNAL_PORT=""

SIGNATURE_HEX="$(python3 - <<PY
import hmac, hashlib
secret = "${SECRET}".encode()
timestamp = "${TIMESTAMP}"
source = "${SOURCE}"
app = "${APP}"
env = "${ENV}"
tag = "${TAG}"
image_repo = "${IMAGE_REPO}"
domain = "${DOMAIN}"
init_deploy = "${INIT_DEPLOY}"
internal_port = "${INTERNAL_PORT}"

sha256 = hashlib.sha256()
with open("${ARTIFACT}", "rb") as f:
    for chunk in iter(lambda: f.read(1024 * 1024), b""):
        sha256.update(chunk)
artifact_sha = sha256.hexdigest()

canonical = "\n".join([
    timestamp,
    source,
    app,
    env,
    tag,
    image_repo,
    artifact_sha,
    domain,
    init_deploy,
    internal_port,
])
print(hmac.new(secret, canonical.encode(), hashlib.sha256).hexdigest())
PY
)"

curl -X POST "${API_URL}" \
  -H "X-SC-Timestamp: ${TIMESTAMP}" \
  -H "X-SC-Signature: sha256=${SIGNATURE_HEX}" \
  -H "X-SC-Source: ${SOURCE}" \
  -F "app=${APP}" \
  -F "env=${ENV}" \
  -F "tag=${TAG}" \
  -F "image_repo=${IMAGE_REPO}" \
  -F "artifact=@${ARTIFACT}"
```
