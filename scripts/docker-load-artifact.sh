#!/usr/bin/env bash
set -euo pipefail

# Load Docker image artifact (.tar or .tar.gz) and optionally retag.
# Usage:
#   ./scripts/docker-load-artifact.sh ./image.tar.gz
#   ./scripts/docker-load-artifact.sh ./image.tar ghcr.io/org/app:v1.2.3

ARTIFACT_PATH="${1:-}"
TARGET_REF="${2:-}"

if [[ -z "${ARTIFACT_PATH}" ]]; then
  echo "Usage: $0 <artifact.tar|artifact.tar.gz> [target-image-ref]" >&2
  exit 1
fi

if [[ ! -f "${ARTIFACT_PATH}" ]]; then
  echo "Artifact file not found: ${ARTIFACT_PATH}" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command not found." >&2
  exit 1
fi

echo "[load] Loading artifact: ${ARTIFACT_PATH}"
if [[ "${ARTIFACT_PATH}" == *.tar.gz || "${ARTIFACT_PATH}" == *.tgz ]]; then
  LOAD_OUTPUT="$(gzip -dc "${ARTIFACT_PATH}" | docker load 2>&1)"
else
  LOAD_OUTPUT="$(docker load -i "${ARTIFACT_PATH}" 2>&1)"
fi
echo "${LOAD_OUTPUT}"

LOADED_REFS="$(printf '%s\n' "${LOAD_OUTPUT}" | sed -n 's/^Loaded image: //p')"

if [[ -n "${TARGET_REF}" ]]; then
  if printf '%s\n' "${LOADED_REFS}" | grep -Fxq "${TARGET_REF}"; then
    echo "[load] Target ref already present: ${TARGET_REF}"
  else
    FIRST_REF="$(printf '%s\n' "${LOADED_REFS}" | head -n 1)"
    if [[ -z "${FIRST_REF}" ]]; then
      echo "[load] Could not determine loaded image ref from docker output." >&2
      echo "[load] Retag manually if needed: docker tag <source_ref_or_id> ${TARGET_REF}" >&2
      exit 1
    fi
    docker tag "${FIRST_REF}" "${TARGET_REF}"
    echo "[load] Retagged ${FIRST_REF} -> ${TARGET_REF}"
  fi
fi

echo "[load] Local images (latest 10):"
docker image ls --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}' | head -n 10
