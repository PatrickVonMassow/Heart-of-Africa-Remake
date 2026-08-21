// Repo paths that follow the checkout the process was GIVEN.
//
// WHY: `fileURLToPath(new URL('..', import.meta.url))` THROWS when
// `import.meta.url` is not a file: URL — which it is not under Vitest's module
// runner. Thrown at import time it takes the whole importing module down, so a
// test (or the guard preflight) that imports a guard wrapper never even gets to
// call it. tasks-source.mjs carries the same note from the day retro-core's test
// failed to load for exactly this reason; this module is that resolution, shared.
//
// A script's source location is not its repository identity. Fixture suites
// deliberately execute a script from this checkout with cwd set to a temporary
// repository; resolving from import.meta.url in that process sends git and file
// writes back into the live checkout. An explicit HOA_REPO_ROOT wins, then the
// Git worktree containing cwd. The module URL is the compatibility fallback
// when cwd does not identify a worktree.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const worktreeRoot = (cwd) => {
  try {
    return resolve(
      execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim(),
    )
  } catch {
    return ''
  }
}

export function repositoryRoot({ explicitRoot = process.env.HOA_REPO_ROOT, cwd = process.cwd(), moduleUrl = import.meta.url } = {}) {
  if (typeof explicitRoot === 'string' && explicitRoot.trim()) return resolve(explicitRoot)
  if (typeof cwd === 'string' && cwd.trim()) {
    const root = worktreeRoot(cwd)
    if (root) return root
  }
  try {
    return resolve(fileURLToPath(new URL('..', moduleUrl)))
  } catch {
    return ''
  }
}

export const REPO_ROOT = repositoryRoot()

/** A path inside the repo: repoPath('.claude', 'batch-paused'). */
export const repoPath = (...parts) => resolve(REPO_ROOT, ...parts)
