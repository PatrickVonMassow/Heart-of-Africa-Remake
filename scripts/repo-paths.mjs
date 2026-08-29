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
import { statSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Git exports these repository-local variables to hooks. In a main checkout
// GIT_DIR is normally absent, but in a linked worktree it is an ABSOLUTE path
// into the shared repository. Passing that environment to a child which runs
// `git -C <fixture>` makes Git ignore the fixture and mutate the live ref store.
// Ask Git for its own list so this follows the installed version; retain a
// complete fallback because the safe answer when that read fails is still to
// remove every repository identity we know about.
const GIT_LOCAL_ENV_FALLBACK = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_INTERNAL_SUPER_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
]

export function gitLocalEnvironmentNames() {
  try {
    return execFileSync('git', ['rev-parse', '--local-env-vars'], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean)
  } catch {
    return GIT_LOCAL_ENV_FALLBACK
  }
}

/** Environment for a child whose cwd/-C must choose its own repository. */
export function withoutGitLocalEnvironment(env = process.env, names = gitLocalEnvironmentNames()) {
  const clean = { ...env }
  for (const name of new Set([...GIT_LOCAL_ENV_FALLBACK, ...(names ?? [])])) delete clean[name]
  // `git -c` is encoded as a count plus numbered pairs. The count is in Git's
  // list, but removing the pairs too prevents a future consumer from reviving
  // stale command-local configuration after supplying a new count.
  for (const name of Object.keys(clean)) {
    if (/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(name)) delete clean[name]
  }
  return clean
}

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

/**
 * The verified main working tree, for processes which must never inherit a
 * linked worktree as their repository identity.
 *
 * `repositoryCommonRoot` deliberately falls back to the supplied checkout for
 * callers whose shared state can remain usable in unusual Git layouts. A batch
 * owner cannot: starting it in a linked worktree splits ordinary repository
 * state from the main checkout. Require the resolved root to contain the real
 * `.git` directory, and refuse loudly when Git cannot provide that guarantee.
 */
export function requireMainCheckoutRoot({ checkoutRoot = '', ...rootOptions } = {}) {
  const checkout = checkoutRoot || repositoryRoot(rootOptions)
  const common = checkout ? repositoryCommonRoot({ checkoutRoot: checkout }) : ''
  try {
    if (common && statSync(resolve(common, '.git')).isDirectory()) return common
  } catch {
    // The error below owns the actionable refusal.
  }
  throw new Error(
    `the main checkout could not be verified from ${checkout || '<unknown checkout>'} — ` +
      'refusing to start a batch owner in a linked worktree',
  )
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
