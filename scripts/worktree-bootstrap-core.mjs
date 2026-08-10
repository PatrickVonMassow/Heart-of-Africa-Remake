// WHAT A FRESH AGENT WORKTREE OWES ITS GATES — the decision, pure.
// (worktree-bootstrap.mjs does the filesystem work.)
//
// WHY IT EXISTS. CLAUDE.md §6 builds every point in a git WORKTREE, and a
// worktree checks out the tracked tree only: `node_modules/` is git-ignored, so
// it is simply absent. Every gate an agent is told to run then fails for a
// reason that has nothing to do with its change — `npm run test:unit` cannot
// even start (npm resolves `vitest` from `node_modules/.bin` before the script
// runs), and `npm run lint` cannot find `oxlint`. Agents worked around it by
// hand, one by symlinking the main tree's `.bin`, and the pool learned that a
// red fast layer is "normal" — which is how a REAL red gets waved through.
//
// THE DECISION. A worktree lives beside the main checkout and its git objects
// are shared, so the main checkout's `node_modules` is the obvious donor — but
// only if it holds the SAME dependencies. `package-lock.json` is versioned, so a
// branch that changed it must not be tested against the main tree's tree; the
// digests of the two lockfiles decide. Equal → link. Different (or the main tree
// has no dependencies either) → a real install, which is correct but slow.
//
// This module answers only "what should happen"; nothing here touches the disk,
// so every branch is covered by plain Vitest cases.
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'

/** Actions plan() can return. */
export const ACTIONS = {
  /** The checkout already has its dependencies — nothing to do. */
  none: 'none',
  /** Link the main checkout's node_modules into this worktree. */
  link: 'link',
  /** Install into this checkout: no usable donor, or the lockfiles differ. */
  install: 'install',
}

/** The reasons, spelled once so the CLI and the tests share the wording. */
export const REASONS = {
  present: 'this checkout already has node_modules',
  notAWorktree: 'this is the main checkout, not a worktree',
  lockMatch: "the main checkout's lockfile is identical, so its node_modules fits",
  lockDiffers: 'the lockfile differs from the main checkout — linking would test against the wrong dependency tree',
  noDonor: 'the main checkout has no node_modules to lend',
  noMainCheckout: 'no main checkout could be derived from the git common directory',
}

/** sha256 of a lockfile's bytes; null for absent content, so a missing lockfile
 *  never compares EQUAL to another missing one. */
export function lockDigest(text) {
  if (typeof text !== 'string' || text.length === 0) return null
  return createHash('sha256').update(text).digest('hex')
}

/**
 * The main working tree behind a checkout, derived from git's COMMON directory.
 *
 * `git rev-parse --git-common-dir` answers the shared `.git` of the repository:
 * `<main>/.git` from the main checkout AND from every worktree (a worktree's own
 * `.git` is a file pointing at `<main>/.git/worktrees/<name>`). Its parent is
 * therefore the main working tree — the one place a worktree's dependencies can
 * be borrowed from. Returns null when the answer is a bare repository (a
 * `.git`-less common dir, which has no working tree to borrow from) or when it
 * IS this checkout.
 */
export function mainCheckoutFrom(gitCommonDir, checkoutRoot) {
  if (typeof gitCommonDir !== 'string' || gitCommonDir.trim() === '') return null
  const common = resolve(gitCommonDir.trim())
  // A bare repo's common dir is the repository itself, not a `.git` inside a
  // working tree; borrowing from it is meaningless.
  if (!/[/\\]\.git$/.test(common)) return null
  const main = dirname(common)
  if (samePath(main, checkoutRoot)) return null
  return main
}

/** Path comparison that does not care about case on Windows. */
export function samePath(a, b, platform = process.platform) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const x = resolve(a)
  const y = resolve(b)
  return platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

/**
 * What this checkout needs.
 *
 * @param {object} state
 * @param {boolean} state.hasOwnDeps        node_modules exists in this checkout
 * @param {string|null} state.mainCheckout  the main working tree, or null
 * @param {boolean} state.mainHasDeps       node_modules exists over there
 * @param {string|null} state.ownLock       this checkout's package-lock.json text
 * @param {string|null} state.mainLock      the main checkout's package-lock.json text
 * @returns {{ action: string, reason: string, from: string|null }}
 */
export function planBootstrap({
  hasOwnDeps = false,
  mainCheckout = null,
  mainHasDeps = false,
  ownLock = null,
  mainLock = null,
} = {}) {
  if (hasOwnDeps) return { action: ACTIONS.none, reason: REASONS.present, from: null }
  if (mainCheckout === null) {
    // Either the main checkout itself, or something we cannot place. Either way
    // there is nothing to borrow, and the dependencies are still missing.
    return { action: ACTIONS.install, reason: REASONS.noMainCheckout, from: null }
  }
  if (!mainHasDeps) return { action: ACTIONS.install, reason: REASONS.noDonor, from: mainCheckout }
  const ours = lockDigest(ownLock)
  const theirs = lockDigest(mainLock)
  if (ours !== null && ours === theirs) {
    return { action: ACTIONS.link, reason: REASONS.lockMatch, from: mainCheckout }
  }
  return { action: ACTIONS.install, reason: REASONS.lockDiffers, from: mainCheckout }
}

/** One line per verdict, for the CLI and for a failing gate's message. */
export const formatPlan = (plan, checkoutRoot) =>
  `worktree-bootstrap: ${plan.action.toUpperCase()} — ${plan.reason}` +
  (plan.from ? `\n  donor:    ${plan.from}` : '') +
  (checkoutRoot ? `\n  checkout: ${checkoutRoot}` : '')
