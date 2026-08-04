#!/usr/bin/env bash
# Bring this host's picture verification up to BOTH backends and onto the real GPU.
#
# WHY THIS EXISTS (measured on the container 04.08.2026, point 493). When the browser
# suites moved into the Linux container they ran single-lane and software-only, and every
# reason given for that turned out to be a missing package rather than a missing device:
#   - /dev/dxg IS passed through and /usr/lib/wsl/lib carries libd3d12/libd3d12core/
#     libdxcore. The GeForce behind it is reachable; nothing needed to change on the host.
#   - WebGL 2 came up as "ANGLE (…SwiftShader…)" only because libGL/libEGL were absent, so
#     ANGLE's `gl` backend had no driver to sit on. With them installed the same lane comes
#     up as "ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 4070 Ti), OpenGL 4.2)"
#     — measured 170 vs 22.7 renderer calls per second on the identical scene, and the
#     `flow` suite went from red-and-unfinished-in-10-minutes to GREEN IN 58 SECONDS.
#   - WebGPU is the one that stays SOFTWARE, and not for want of trying. Debian 12 ships
#     Mesa 22.3.6 and even the 25.0.7 backport is built WITHOUT Dozen (dzn), the
#     Vulkan-on-D3D12 driver, so the loader offered llvmpipe alone. Dozen builds cleanly
#     from the Debian mesa source (--with-dzn below) and `vulkaninfo` then enumerates
#     "Microsoft Direct3D12 (NVIDIA GeForce RTX 4070 Ti)" — but Chrome 151 DECLINES it:
#     asked for an adapter with the loader scoped to dzn alone, Dawn still answers with
#     its own bundled SwiftShader, and with the full ICD set visible the browser HANGS at
#     adapter time. So the WebGPU lane runs on SwiftShader, correct and slow, and is
#     labelled as such by backend-lane-check.mjs. The dzn build stays here, opt-in, as the
#     starting point for the next attempt (a Chrome that accepts a system Vulkan device).
#
# Everything installs system-wide, so this needs root ONCE. It is idempotent: a second run
# installs nothing and says so.
#
#   sudo bash scripts/verify-host-setup.sh             # install what is missing
#   sudo bash scripts/verify-host-setup.sh --with-dzn  # …and build Dozen (see above)
#   bash scripts/verify-host-setup.sh --check          # no root; report what is missing
#
# PROVE it at the picture afterwards — a package list is not evidence:
#   node scripts/verify/backend-lane-check.mjs
set -euo pipefail

CHECK_ONLY=0
WITH_DZN=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --with-dzn) WITH_DZN=1 ;;
    *) printf 'verify-host-setup: unknown argument %s\n' "$arg" >&2; exit 2 ;;
  esac
done

MESA_VERSION=25.0.7
DZN_LIB=/usr/lib/x86_64-linux-gnu/libvulkan_dzn.so
DZN_ICD=/usr/share/vulkan/icd.d/dzn_icd.x86_64.json
# The user whose HOME Chrome writes its crash database into. Under sudo that is the
# invoking user, not root — see the crashpad step below.
TARGET_USER=${SUDO_USER:-$(id -un)}
TARGET_HOME=$(getent passwd "$TARGET_USER" | cut -d: -f6)

have() { command -v "$1" >/dev/null 2>&1; }
say() { printf '%s\n' "$*"; }

missing=()
have google-chrome-stable || have google-chrome ||
  missing+=("google-chrome-stable (the WebGPU lane needs a SYSTEM Chrome — point 184)")
[ -O "${TARGET_HOME}/.config" ] ||
  missing+=("${TARGET_HOME}/.config owned by ${TARGET_USER} (Chrome cannot place its crash database and dies at launch)")
ldconfig -p | grep -q 'libGL\.so\.1' ||
  missing+=("libgl1/libegl1 (without them ANGLE's gl backend has no driver and WebGL 2 drops to SwiftShader)")
ls /usr/lib/x86_64-linux-gnu/dri/d3d12_dri.so >/dev/null 2>&1 ||
  missing+=("mesa's d3d12 Gallium driver (the one that reaches /dev/dxg)")
if [ "$WITH_DZN" = "1" ] && { [ ! -e "$DZN_LIB" ] || [ ! -e "$DZN_ICD" ]; }; then
  missing+=("Dozen / dzn, Vulkan-on-D3D12 (built here — no distribution packages it)")
fi
[ -e /etc/ld.so.conf.d/wsl.conf ] ||
  missing+=("/usr/lib/wsl/lib on the loader path (the WSL D3D12 libraries the drivers open)")

if [ "$CHECK_ONLY" = "1" ]; then
  if [ ${#missing[@]} -eq 0 ]; then
    say "verify-host-setup: nothing missing — run scripts/verify/backend-lane-check.mjs for the picture-level proof"
    exit 0
  fi
  say "verify-host-setup: MISSING on this host —"
  for m in "${missing[@]}"; do say "  · $m"; done
  say ""
  say "Install it:  sudo bash scripts/verify-host-setup.sh"
  exit 1
fi

if [ "$(id -u)" != "0" ]; then
  say "verify-host-setup: this needs root (it installs system packages)."
  say "  sudo bash scripts/verify-host-setup.sh"
  say "Or --check (no root) to see what is missing."
  exit 1
fi

if [ ${#missing[@]} -eq 0 ]; then
  say "verify-host-setup: already complete — nothing to do."
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive

# --- 1. The crashpad blocker ------------------------------------------------------------
# The image leaves ${TARGET_HOME}/.config owned by root. Chrome derives its crash-database
# path from $XDG_CONFIG_HOME (default ~/.config), cannot create it, and spawns its handler
# with no --database — which aborts the browser with SIGTRAP before a page ever loads:
#     chrome_crashpad_handler: --database is required
# Playwright's own launch happens to route around it; a bare launch and every diagnostic
# run does not. One chown ends it for both.
if [ -n "$TARGET_HOME" ] && [ -d "${TARGET_HOME}/.config" ]; then
  chown "$TARGET_USER" "${TARGET_HOME}/.config"
  say "verify-host-setup: ${TARGET_HOME}/.config now belongs to ${TARGET_USER} (Chrome's crash database)"
fi

# --- 2. bookworm-backports ---------------------------------------------------------------
# Debian 12's own Mesa is 22.3.6 (2023). The backport is 25.0.7, which is both the newer
# GL stack and the source the dzn build below is cut from.
if [ ! -e /etc/apt/sources.list.d/backports.list ]; then
  printf '%s\n' 'deb http://deb.debian.org/debian bookworm-backports main' >/etc/apt/sources.list.d/backports.list
fi
apt-get update -qq

# --- 3. The graphics stack ---------------------------------------------------------------
# libgl1/libegl1 are what ANGLE's `gl` backend dlopens; the mesa DRI package carries
# d3d12_dri.so, which is what turns /dev/dxg into hardware OpenGL.
apt-get install -y --no-install-recommends -t bookworm-backports \
  libgl1 libglx-mesa0 libegl1 libgl1-mesa-dri mesa-vulkan-drivers libvulkan1 vulkan-tools

# --- 4. Google Chrome stable -------------------------------------------------------------
# The WebGPU lane's browser (point 184: a SYSTEM Chrome with --headless=new). Debian ships
# only Chromium, and the lane is verified against Chrome. dl.google.com must be reachable —
# in this sandbox that means it is on the firewall allowlist.
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

# --- 5. The loader wiring ----------------------------------------------------------------
# Read by every process, so a suite started by hand behaves like one started by the batch.
printf '%s\n' '/usr/lib/wsl/lib' >/etc/ld.so.conf.d/wsl.conf
ldconfig

# --- 6. Dozen (dzn) — Vulkan on D3D12, OPT-IN --------------------------------------------
# No distribution builds this: it is Mesa's `microsoft-experimental` Vulkan driver, off in
# every packaged build, and it is the ONLY way a Vulkan device on this host is the GeForce
# rather than llvmpipe. Built from the same Mesa source Debian backports, with gallium and
# LLVM switched off, so the compile is minutes rather than an hour.
#
# OPT-IN because it does not yet buy the lane anything and is not free of risk: Chrome 151
# ignores it for WebGPU (measured — scoped to dzn alone, Dawn still returns SwiftShader),
# and with every ICD visible a browser launched with --enable-features=Vulkan HANGS at
# adapter time. Both lanes this repo ships pass with it installed, because neither asks the
# Vulkan loader anything. Build it when re-attempting the hardware WebGPU lane.
if [ "$WITH_DZN" = "1" ] && { [ ! -e "$DZN_LIB" ] || [ ! -e "$DZN_ICD" ]; }; then
  apt-get install -y --no-install-recommends -t bookworm-backports \
    meson directx-headers-dev ninja-build python3-mako bison flex libdrm-dev pkg-config \
    libexpat1-dev zlib1g-dev python3-yaml curl xz-utils
  build_dir=$(mktemp -d)
  trap 'rm -rf "$build_dir"' EXIT
  curl -fsSL -o "$build_dir/mesa.tar.xz" \
    "http://deb.debian.org/debian/pool/main/m/mesa/mesa_${MESA_VERSION}.orig.tar.xz"
  tar -C "$build_dir" -xf "$build_dir/mesa.tar.xz"
  src="$build_dir/mesa-${MESA_VERSION}"
  meson setup "$src/build-dzn" "$src" \
    -Dvulkan-drivers=microsoft-experimental -Dgallium-drivers= -Dglx=disabled -Degl=disabled \
    -Dgbm=disabled -Dplatforms= -Dllvm=disabled -Dvideo-codecs= -Dbuildtype=release
  ninja -C "$src/build-dzn"
  install -m 0644 "$src/build-dzn/src/microsoft/vulkan/libvulkan_dzn.so" "$DZN_LIB"
  install -d -m 0755 /usr/share/vulkan/icd.d
  install -m 0644 "$src/build-dzn/src/microsoft/vulkan/dzn_icd.x86_64.json" "$DZN_ICD"
  ldconfig
fi

say ""
say "verify-host-setup: done. The Vulkan devices this host now offers:"
vulkaninfo --summary 2>/dev/null | grep -E 'deviceName|driverName' || say "  (vulkaninfo said nothing — that is itself a finding)"
say ""
say "PROVE it at the picture — a package list is not evidence:"
say "  node scripts/verify/backend-lane-check.mjs"
