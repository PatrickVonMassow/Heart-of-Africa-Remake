#!/usr/bin/env bash
set -euo pipefail

# Parameters let the unit tests exercise startup against an isolated checkout.
# The executable path below always uses the real mounts; environment variables
# cannot redirect the security check or launcher.
container_entrypoint() {
  local repo="$1" config="$2"
  shift 2

  if [[ ! -f "$config" || -w "$config" ]]; then
    echo 'ERROR: the devcontainer configuration must exist and be read-only' >&2
    return 1
  fi
  # A Docker restart has no postStart lifecycle callback. Restore the firewall
  # before any batch process can run, even with no editor connected.
  sudo /usr/local/bin/init-firewall.sh

  if [[ -f "$repo/scripts/batch-launcher.mjs" ]]; then
    (cd "$repo" && node scripts/batch-launcher.mjs --arm)
  elif [[ -e "$repo/.git" ]]; then
    echo 'ERROR: the existing checkout has no batch launcher; deploy the repository change first' >&2
    return 1
  else
    # An empty volume is filled by postCreateCommand, which then arms it.
    echo 'container-start: empty workspace; launcher deferred to postCreateCommand'
  fi

  exec "$@"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  container_entrypoint /workspace/hoa /workspace/.devcontainer/devcontainer.json "$@"
fi
