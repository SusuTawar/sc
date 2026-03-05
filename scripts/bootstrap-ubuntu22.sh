#!/usr/bin/env bash
set -euo pipefail

# Fresh Ubuntu 22 host bootstrap for container workloads.
# Safe to rerun: existing Docker install, firewall rules, and swap are detected.

SSH_PORT="${SSH_PORT:-22}"
SWAP_FILE="${SWAP_FILE:-/swapfile}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"
SWAP_MIN_RAM_GB="${SWAP_MIN_RAM_GB:-4}"

log() {
  echo "[bootstrap] $*"
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run as root (example: sudo bash scripts/bootstrap-ubuntu22.sh)." >&2
    exit 1
  fi
}

ensure_supported_os() {
  . /etc/os-release
  if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "22.04" ]]; then
    echo "This script is intended for Ubuntu 22.04. Detected: ${PRETTY_NAME:-unknown}." >&2
    exit 1
  fi
}

update_upgrade() {
  log "Updating apt metadata and upgrading packages..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get upgrade -y
  apt-get install -y ca-certificates curl gnupg lsb-release ufw
}

setup_firewall() {
  log "Configuring UFW..."
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow "${SSH_PORT}/tcp"
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
  ufw status verbose
}

ensure_swap_if_needed() {
  if swapon --show --noheadings | grep -q .; then
    log "Swap already enabled. Skipping swap creation."
    return
  fi

  local mem_kb mem_gb
  mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
  mem_gb="$(( (mem_kb + 1024 * 1024 - 1) / (1024 * 1024) ))"

  if (( mem_gb >= SWAP_MIN_RAM_GB )); then
    log "RAM is ${mem_gb}GB (>= ${SWAP_MIN_RAM_GB}GB). Swap not required."
    return
  fi

  log "RAM is ${mem_gb}GB (< ${SWAP_MIN_RAM_GB}GB). Creating ${SWAP_SIZE_GB}GB swap at ${SWAP_FILE}..."
  if ! fallocate -l "${SWAP_SIZE_GB}G" "${SWAP_FILE}" 2>/dev/null; then
    dd if=/dev/zero of="${SWAP_FILE}" bs=1M count="$((SWAP_SIZE_GB * 1024))" status=progress
  fi
  chmod 600 "${SWAP_FILE}"
  mkswap "${SWAP_FILE}"
  swapon "${SWAP_FILE}"

  if ! grep -q "^${SWAP_FILE}[[:space:]]" /etc/fstab; then
    echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
  fi

  cat >/etc/sysctl.d/99-swap.conf <<EOF
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
  sysctl --system >/dev/null
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker already installed. Ensuring service is enabled..."
    systemctl enable --now docker
    return
  fi

  log "Installing Docker Engine + Compose plugin..."
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  . /etc/os-release
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker

  if [[ -n "${SUDO_USER:-}" ]] && id -u "${SUDO_USER}" >/dev/null 2>&1; then
    log "Adding ${SUDO_USER} to docker group..."
    usermod -aG docker "${SUDO_USER}"
  fi
}

verify() {
  log "Verifying Docker..."
  docker --version
  docker compose version
}

main() {
  require_root
  # ensure_supported_os
  update_upgrade
  setup_firewall
  ensure_swap_if_needed
  install_docker
  verify
  log "Bootstrap complete."
}

main "$@"
