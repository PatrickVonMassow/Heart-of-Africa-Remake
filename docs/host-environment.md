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
