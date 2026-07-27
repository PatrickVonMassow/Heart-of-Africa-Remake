// Repo paths that survive a test runner (point 365 D).
//
// WHY: `fileURLToPath(new URL('..', import.meta.url))` THROWS when
// `import.meta.url` is not a file: URL — which it is not under Vitest's module
// runner. Thrown at import time it takes the whole importing module down, so a
// test (or the guard preflight) that imports a guard wrapper never even gets to
// call it. tasks-source.mjs carries the same note from the day retro-core's test
// failed to load for exactly this reason; this module is that resolution, shared.
//
// Same value as before wherever import.meta.url IS a file URL — the fallback to
// the working directory only takes over where the old form would have thrown.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = (() => {
  try {
    return fileURLToPath(new URL('..', import.meta.url))
  } catch {
    return process.cwd()
  }
})()

/** A path inside the repo: repoPath('.claude', 'batch-paused'). */
export const repoPath = (...parts) => resolve(REPO_ROOT, ...parts)
