# What the host must provide

Everything the project needs that is **not** in this repository, and therefore does not
travel with a `git clone`. The move from Windows to a Linux container on 03.08.2026 found
each of these the hard way — five separate gaps, none of which announced itself (retrospective
§3.75). Keep this list in step with reality: a session's start check reads it, and what is not
listed here is not checked.

## Per host

| What | Where | Why it matters |
|---|---|---|
| Memory corpus | `<CLAUDE_CONFIG_DIR>/projects/<slug>/memory/` | ~70 files of binding project rules. Without them a session works from `CLAUDE.md` and the guards alone. |
| GitHub token | `.secrets/github-token` (repo root, git-ignored, mode 0600) | `ci-status-guard` reads CI status. Without it the API runs unauthenticated — 60 requests/hour instead of 5000 — and the guard is one rate-limit away from silently failing open. |
| Session launcher | Windows: the `HoA-Batch-Autostart` scheduled task · Linux: the launcher daemon (`scripts/batch-launcher.mjs`) | Wakes the successor session at a point boundary. Without it the batch stops after one point. |
| Browser for the picture verification | `npx playwright install chromium`, plus a system Chrome for the WebGPU lane | Every render/GUI point merges only against a verified picture. Without a browser, no such point can merge. |
| Notification topic | `.claude/ntfy-topic` | The only channel that still speaks when a session is wedged. |

## Container specifics (Linux)

The sandbox firewall allows a fixed domain list. Two additions the browser verification
needs, both in `.devcontainer/init-firewall.sh`:

- `cdn.playwright.dev` — the download entry point (was already allowed).
- `storage.googleapis.com` — where that entry point **redirects** the Chrome-for-Testing
  archive to. Resolved as `/24` ranges, because Google serves it from a large rotating
  address pool and the single address resolved at boot is usually not the one the download
  lands on minutes later.
- `us.aws.cdn.hf.co` and `cdn.jsdelivr.net` — the same redirect trap, one layer down, and
  it cost the whole regression on 04.08.2026 (point 499). `huggingface.co` was allowed and
  answered; the Kokoro model download **redirects** from it to an AWS pool that was not,
  and the ORT-WASM runtime comes from jsdelivr, which was not either. Both TTS suites
  (`handwriting`, `voice`) then died on the unreachable host with no FAIL line at all. Both
  are `/24` pools, both are in `DEFAULT_TOPUP`, so `node scripts/firewall-allow.mjs` alone
  restores them after a restart — and both are green once they are reachable.

**Measured 04.08.2026 (point 493), so nobody has to guess again.** The GPU behind
`/dev/dxg` IS reachable from the container, and what stood between the suites and it was
packages, not hardware:

- **WebGL 2 now runs on the card.** `--use-angle=gl` with `GALLIUM_DRIVER=d3d12` in the
  browser's environment comes up as `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce
  RTX 4070 Ti), OpenGL 4.6)`. Measured against the SwiftShader lane it replaced: **170 vs
  22.7 renderer calls per second** on the identical scene, and the `flow` suite went from
  red-and-unfinished-after-ten-minutes to **green in 58 seconds**. Both halves are
  load-bearing, and the next container rebuild needs BOTH: without `libgl1`, `libglx-mesa0`
  and `libegl1` ANGLE has nothing to dlopen (`Could not dlopen libGL.so.1` → `Exiting GPU
  process due to errors during initialization`), and without the Gallium pin Mesa 25 serves
  llvmpipe while every interface still looks healthy (Mesa 22.3.6 chose d3d12 by itself;
  the 25.0.7 backport does not).
- **WebGPU runs, in software.** System Chrome exposes `navigator.gpu` on a secure-context
  page — the earlier "undefined" reading came from probing `about:blank`/`data:` URLs,
  which are not secure contexts — and the lane draws the real game once ANGLE *and* Dawn
  are both pinned to Chrome's bundled SwiftShader. Left to disagree they report an adapter,
  initialise `isWebGPUBackend`, advance the frame counter and paint nothing: the page throws
  `Instance dropped in popErrorScope` and the canvas stays black behind a live HUD.
- **Hardware WebGPU is the open item.** Vulkan on this host means Dozen (dzn,
  Vulkan-on-D3D12). No distribution ships it — not Debian 12's Mesa 22.3.6, not the 25.0.7
  backport — but it builds from the Debian mesa source
  (`sudo bash scripts/verify-host-setup.sh --with-dzn`) and `vulkaninfo` then enumerates
  `Microsoft Direct3D12 (NVIDIA GeForce RTX 4070 Ti)`. Chrome 151 still declines it: with
  `VK_ICD_FILENAMES`/`VK_DRIVER_FILES` scoped to dzn ALONE, Dawn answers with its own
  bundled SwiftShader anyway (in one second), and with the full ICD set visible a browser
  launched with `--enable-features=Vulkan` HANGS at adapter time (>40 s, reproduced). So
  the build is OPT-IN and the default install places no ICD — nothing can wander into the
  hang — and the hardware WebGPU lane waits for a browser that accepts a system Vulkan
  device. **Read this before rebuilding dzn: the verdict is worth more than the build.**

**What the software WebGPU lane can and cannot answer, measured 05.08.2026** (point 499's
quiet repeat: the six suites that reddened in the LARGE run, re-run alone with no other
verify run on the machine). `gamepad` went green — its red was load. Five stayed red, and
not one of them is a product defect this lane found:

- `polish` and `settings` fail four checks that measure a RATE the lane cannot deliver —
  the goat's planted foot reports "MEASURED NOTHING, 1 usable stance interval" against 23
  measured on the WebGL lane, the dry-season reading does not settle inside 60 s, and the
  walking footstep never fires. All four are green, measured, on WebGL 2 (point 506).
- `benchmark` dies at `page.waitForFunction: Timeout 300000ms exceeded` — its fixed
  864-frame route cannot finish at software speed (point 506).
- `enrichments` dies in a pixel probe on Playwright's undeclared 30 s (point 492).
- `invariants` loses the WebGPU device mid-run (`Device Lost`, `mapAsync` on a dropped
  instance) and still reports `2 pass, 0 fail` — the checks after the loss never ran
  (point 507).
- The panorama reds (leave capture, compass probe) appear on BOTH lanes and are the real
  defects of points 500/501.

Quiet, the hardware WebGL 2 lane keeps exactly four reds, each twice and each already a
named point: the leave capture and the two band probes (500/501) in `polish`, the calf that
does not drown and the High Atlas snow (502/503) in `enrichments`. The dressing-growth check
reporting `samples [0,0,0,0,0]` failed in one run of two — the measures-nothing flake point
200 lists. Nothing else on that lane is red.

The frames this lane WRITES carry the same shortfall: on the software pass
`100-cairo-giza-skyline.png` came back 29 KB against 568 KB from a lane with the GPU — an
all-but-empty picture the shutter still accepted, which is what point 489 is for. Do not
record acceptance screenshots from the software lane.

`scripts/verify-host-setup.sh` installs all of it (root, once, idempotent) and
`scripts/verify/backend-lane-check.mjs` proves the result at the PICTURE — it boots the
real game on each lane, reads the pixels back out of the canvas and names the device that
drew them, so a software rasteriser can never be reported as if it were the GPU.

**Two container facts worth keeping.** The image leaves `~/.config` owned by root; Chrome
derives its crash-database path from it, cannot create one, and aborts with
`chrome_crashpad_handler: --database is required` before a page loads (Playwright's own
launch routes around it, a bare one does not). And `deb.debian.org` moves between address
ranges, so an `apt-get` that worked an hour ago can fail. The supported, ADDITIVE fix is
`node scripts/firewall-allow.mjs <host> --net24`. Never re-run `init-firewall.sh` to
"refresh" it, and never `iptables -F/-X/-P`, `ipset destroy` or `iptables-restore`: they
flush every rule while the default policy stays DROP and can seal the container. A
PreToolUse guard refuses all four.

Rendering needs a real GPU. Without one, Chrome falls back to SwiftShader, which drops the
frame rate to roughly one frame per second and makes every motion or interaction check
meaninglessly slow — a green run there proves nothing about timing. Under WSL2 the GPU
reaches the container through `--device=/dev/dxg`, a read-only bind mount of `/usr/lib/wsl`
and `LD_LIBRARY_PATH=/usr/lib/wsl/lib`. **If the host exposes no WSL GPU, that device
argument prevents the container from starting at all** — removing it and the mount is the
way back, at the cost of falling back to software rendering.

The working copy lives on a container volume at `/workspace/hoa` (since 04.08.2026), not on
a bind mount of the Windows filesystem. The reason is measured, on 300 small files: on the
9p bind **write 1590 ms, read 621 ms, stat 331 ms**, on the volume **5 ms / 3 ms / 1 ms** —
a factor of 200 to 300 per file operation. That, not Linux and not the tests, was why the
unit layer took twenty minutes and anything spawning a process per record took minutes.
`fill-workspace.sh` clones the volume from the Windows folder, which stays mounted
READ-ONLY at `/backup/hoa` as the backup it now is; `postCreateCommand` then runs
`npm install`, and the image creates the mount point owned by `node` so the volume inherits
that ownership. Since 04.08.2026 the image also grants `node` passwordless root, on the
user's decision that no step inside the container is handed back to him — the egress
firewall stays configured but is, against anything running as `node`, no longer a hard
boundary.

**The definition Docker reads is the host's, not this repository's.** VS Code builds from
`<devcontainer folder>/.devcontainer/` on the Windows side, mounted at `/workspace`; the
copy under `.devcontainer/` here exists so the definition travels with a clone. The two
drift silently: on 04.08.2026 the repository copy still held a `git clone` that the real
one had already replaced, and a rebuild from it would have failed. Change one, copy it to
the other in the same commit, and `diff` all four files (`Dockerfile`, `devcontainer.json`,
`fill-workspace.sh`, `init-firewall.sh`) when a container question comes up.

The image ships **npm 11**. The bundled npm 10.8.2 of `node:20` does not know
`package-lock.json`'s `libc` field and strips it silently, which left the tree dirty after
every container create.

All of these settings live in the container definition, so they take effect only on a
container rebuild, never on a restart.
