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
import { basename, dirname, resolve } from 'node:path'
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

const commonCheckoutRoot = (checkout) => {
  try {
    const commonDir = resolve(
      checkout,
      execFileSync('git', ['-C', checkout, 'rev-parse', '--git-common-dir'], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim(),
    )
    // A normal repository and every linked worktree in it share the main
    // checkout's `<root>/.git`. Custom external git-dir layouts deliberately
    // fall back to the checkout: their metadata parent is not a working tree.
    return basename(commonDir) === '.git' ? dirname(commonDir) : checkout
  } catch {
    return checkout
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

/**
 * The one checkout shared by every linked worktree in this repository.
 *
 * Source and fixture paths follow the checkout the process was given; host-local
 * singleton state cannot. Otherwise a CLI started from a linked worktree gets a
 * second lock and a young fence counter beside the main checkout's live batch.
 */
export function repositoryCommonRoot({ checkoutRoot = '', ...rootOptions } = {}) {
  const checkout = checkoutRoot || repositoryRoot(rootOptions)
  return checkout ? commonCheckoutRoot(checkout) : ''
}

export const REPO_ROOT = repositoryRoot()

/** Resolve the shared checkout only for callers that use singleton state. */
export const COMMON_REPO_ROOT = (() => {
  let root
  return () => {
    root ??= repositoryCommonRoot({ checkoutRoot: REPO_ROOT })
    return root
  }
})()

/** A path inside the repo: repoPath('.claude', 'batch-paused'). */
export const repoPath = (...parts) => resolve(REPO_ROOT, ...parts)

/** A host-local path shared by the main checkout and all its linked worktrees. */
export const commonRepoPath = (...parts) => resolve(COMMON_REPO_ROOT(), ...parts)
