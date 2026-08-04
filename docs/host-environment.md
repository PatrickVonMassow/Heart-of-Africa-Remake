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

**The firewall binds root too** (measured 04.08.2026). It is iptables-wide, so a `docker exec
-u root` shell is as fenced in as `node`: `deb.debian.org` and `dl.google.com` are not on the
allowlist and are unreachable, and `apt-get` therefore fails whoever runs it. The durable way
to add the GPU stack is the container IMAGE, whose build runs outside the sandbox:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvulkan1 mesa-vulkan-drivers libgl1-mesa-dri vulkan-tools \
      ca-certificates curl gnupg \
 && install -d -m 0755 /etc/apt/keyrings \
 && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
      | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
 && echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main' \
      > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
 && echo /usr/lib/wsl/lib > /etc/ld.so.conf.d/wsl.conf && ldconfig \
 && rm -rf /var/lib/apt/lists/*
```

What that buys is not symmetrical, and saying so up front avoids a wasted rebuild: Mesa's
d3d12 driver reaching `/dev/dxg` is the standard WSL path and should take WebGL 2 off the CPU
— that is the speed. The WebGPU lane additionally needs a Vulkan driver over D3D12 (dzn),
which is experimental; if it does not carry the game, the fallback is the user's lane 2 (the
second backend run by hand on Windows). `scripts/verify/backend-lane-check.mjs` answers both
questions at the picture, in one run.

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
