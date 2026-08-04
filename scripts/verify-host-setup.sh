#!/usr/bin/env bash
# Bring this host's picture verification up to BOTH backends and off software rendering.
#
# WHY THIS EXISTS (measured on the container 04.08.2026, point 493):
#   - `navigator.gpu` is UNDEFINED in Playwright's bundled Chromium here, with and without
#     --enable-unsafe-webgpu, so the WebGPU lane cannot open at all (point 184's finding,
#     re-measured on Linux).
#   - WebGL 2 comes up as "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)),
#     SwiftShader driver)" — pure software. That is why the suites crawl: no GPU is reached.
#   - /dev/dxg EXISTS and /usr/lib/wsl/lib carries libd3d12.so, libd3d12core.so, libdxcore.so.
#     The card is reachable; what is missing is a driver stack that can use it and a browser
#     that can drive it. Putting the WSL libraries on the loader path alone changes nothing.
#
# Both missing pieces install system-wide, so this script needs root ONCE. It is idempotent:
# a second run installs nothing and says so.
#
# HOW TO GET ROOT HERE — `sudo` is NOT the way (measured 04.08.2026). The official Claude
# Code image grants the `node` user exactly one passwordless command:
#     node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh
# Anything else prompts for a password that was never set, so `sudo bash …` dead-ends for
# the user as much as for a session. Run it from OUTSIDE the container instead, e.g. in
# PowerShell on the Windows host:
#     docker ps                                   # find the container name
#     docker exec -it -u root <name> bash -lc "cd /workspace/hoa && bash scripts/verify-host-setup.sh"
# Widening the sudoers file to NOPASSWD: ALL would undo a deliberate part of the image's
# hardening — the docker route grants root for one command instead of forever.
#
# WHAT DOES NOT SURVIVE: a container REBUILD discards this, because it changes the running
# container and not the image. Re-running it costs one command (it is idempotent); baking it
# into the container definition is the durable fix and lives on the host, not in this repo.
#
# Usage:  docker exec -u root <container> bash -lc "cd /workspace/hoa && bash scripts/verify-host-setup.sh"
#         bash scripts/verify-host-setup.sh --check   (no root, reports what is missing)
set -euo pipefail

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

have() { command -v "$1" >/dev/null 2>&1; }
say() { printf '%s\n' "$*"; }

missing=()
have google-chrome-stable || have google-chrome || missing+=("google-chrome-stable (the WebGPU lane needs a SYSTEM Chrome — the bundled Chromium has no headless adapter)")
[ -e /usr/share/vulkan/icd.d ] || missing+=("a Vulkan ICD directory (no driver can be registered without it)")
ls /usr/lib/x86_64-linux-gnu/libvulkan.so* >/dev/null 2>&1 || missing+=("libvulkan1 (the Vulkan loader)")
ls /usr/lib/x86_64-linux-gnu/dri/*d3d12* >/dev/null 2>&1 || missing+=("mesa d3d12 / dzn (the drivers that reach /dev/dxg)")

if [ "$CHECK_ONLY" = "1" ]; then
  if [ ${#missing[@]} -eq 0 ]; then
    say "verify-host-setup: nothing missing — run scripts/verify/backend-lane-check.mjs for the picture-level proof"
    exit 0
  fi
  say "verify-host-setup: MISSING on this host —"
  for m in "${missing[@]}"; do say "  · $m"; done
  say ""
  say "Install it from OUTSIDE the container (sudo cannot: the image allows node only the firewall script):"
  say "  docker exec -it -u root <container> bash -lc \"cd /workspace/hoa && bash scripts/verify-host-setup.sh\""
  exit 1
fi

if [ "$(id -u)" != "0" ]; then
  say "verify-host-setup: this needs root (it installs system packages)."
  say "From OUTSIDE the container: docker exec -it -u root <container> bash -lc \"cd /workspace/hoa && bash scripts/verify-host-setup.sh\""
  say "Or --check (no root) to see what is missing."
  exit 1
fi

if [ ${#missing[@]} -eq 0 ]; then
  say "verify-host-setup: already complete — nothing to do."
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# The drivers first: without them a system Chrome still renders through SwiftShader, which
# buys backend coverage but none of the speed this was done for.
apt-get install -y --no-install-recommends \
  libvulkan1 mesa-vulkan-drivers libgl1-mesa-dri vulkan-tools

# Google Chrome stable — the WebGPU lane's browser. From Google's own repository, because
# Debian/Ubuntu ship Chromium only and the lane is verified against Chrome.
if ! have google-chrome-stable && ! have google-chrome; then
  apt-get install -y --no-install-recommends ca-certificates curl gnupg
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://dl.google.com/linux/linux_signing_key.pub |
    gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg
  printf '%s\n' \
    'deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main' \
    >/etc/apt/sources.list.d/google-chrome.list
  apt-get update -qq
  apt-get install -y --no-install-recommends google-chrome-stable
fi

# The loader wiring for the WSL GPU. Both are read by every process, so the lane needs no
# per-run environment and a suite started by hand behaves like one started by the batch.
printf '%s\n' '/usr/lib/wsl/lib' >/etc/ld.so.conf.d/wsl.conf
ldconfig

say ""
say "verify-host-setup: done. PROVE it now, at the picture:"
say "  node scripts/verify/backend-lane-check.mjs"
