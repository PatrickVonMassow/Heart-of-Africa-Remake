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

**Measured 04.08.2026 (point 493), so nobody has to guess again.** In the container as it
stands, WebGL 2 comes up as `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)),
SwiftShader driver)` — pure software — and `navigator.gpu` is UNDEFINED in Playwright's
bundled Chromium, with or without `--enable-unsafe-webgpu`. So there is no WebGPU lane at
all here, and the WebGL 2 lane runs on the CPU. Putting `/usr/lib/wsl/lib` on the loader
path changes neither: the D3D12 libraries are present, but no Vulkan loader and no Mesa
d3d12/dzn driver exist to use them, and there is no `/usr/share/vulkan/icd.d` at all.
`scripts/verify-host-setup.sh` installs both halves (root, once) and
`scripts/verify/backend-lane-check.mjs` proves the result at the picture rather than at a
version string.

Rendering needs a real GPU. Without one, Chrome falls back to SwiftShader, which drops the
frame rate to roughly one frame per second and makes every motion or interaction check
meaninglessly slow — a green run there proves nothing about timing. Under WSL2 the GPU
reaches the container through `--device=/dev/dxg`, a read-only bind mount of `/usr/lib/wsl`
and `LD_LIBRARY_PATH=/usr/lib/wsl/lib`. **If the host exposes no WSL GPU, that device
argument prevents the container from starting at all** — removing it and the mount is the
way back, at the cost of falling back to software rendering.

The repository itself is bind-mounted from the Windows filesystem over 9p, so it never
physically moved. Measured 03.08.2026 on 300 small files: **write 1447 ms, read 1046 ms,
stat 606 ms** against **8 ms / 1 ms / 1 ms** on the container's own disk — a factor of 180
to 1000 per file operation. That, not Linux and not the tests, is why the unit layer takes
twenty minutes here and why anything that spawns a process per record takes minutes.
`node_modules` — the bulk of those files — therefore lives on a container volume, mounted
over the bind. The volume starts empty, so `postCreateCommand` runs `npm install` to fill
it, and the image creates the mount point owned by `node` (the volume inherits that
ownership; `node` has no general sudo to fix it afterwards).

All of these settings live in the container definition, so they take effect only on a
container rebuild, never on a restart.
