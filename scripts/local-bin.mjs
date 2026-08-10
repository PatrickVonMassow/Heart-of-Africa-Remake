// WHERE A LOCALLY INSTALLED TOOL ACTUALLY IS — one resolver, not five copies.
//
// WHY IT EXISTS. `resolve(process.cwd(), 'node_modules/.bin/oxlint')` is the
// obvious spelling and it is wrong in the environment most of this project's
// work happens in. CLAUDE.md §6 builds every point in a git WORKTREE;
// `node_modules/` is git-ignored, so it is not there, and the spawn fails with
// ENOENT. That cost every delegated agent a detour — and worse, it made a whole
// suite LIE, because a spawn that never started exits non-zero exactly like a
// tool that ran and rejected (see `assertRan` below, and scope.test.mjs).
//
// THE ORDER, and why each step earns its place:
//  1. WALK UP from the checkout. Node itself resolves modules by walking
//     ancestors, so a nested package or a worktree that happens to live inside
//     the main checkout is served here, and the nearest install wins.
//  2. THE MAIN WORKING TREE, derived from git's COMMON directory. A worktree
//     placed OUTSIDE the main checkout shares `<main>/.git` and nothing else,
//     so no amount of walking up reaches the dependencies; git is the only thing
//     that knows where they are. (`scripts/worktree-bootstrap.mjs` normally puts
//     a link in place before any gate runs; this is the belt to that braces.)
//  3. PATH. A globally installed runner is a legitimate way to have the tool,
//     and refusing it would fail a run that could have passed.
// Nothing found is REPORTED, never guessed: `describeMissing` names the tool and
// every directory that was searched, so the reader sees why rather than reading
// ENOENT off a spawn.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { delimiter, dirname, join, resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'

/** The file names one binary can have. Windows spawns need the wrapper, not the
 *  extension-less shell script beside it. */
export function binaryNames(name, platform = process.platform) {
  return platform === 'win32' ? [`${name}.cmd`, `${name}.exe`, `${name}.bat`, name] : [name]
}

/** Every ancestor of `start`, nearest first, including `start` itself. */
export function ancestors(start) {
  const out = []
  let dir = resolve(start)
  for (;;) {
    out.push(dir)
    const up = dirname(dir)
    if (up === dir) return out
    dir = up
  }
}

/**
 * The directories that may hold a `node_modules/.bin`, in search order.
 * Pure: it decides WHERE to look, and takes no view on what is on disk.
 */
export function searchRoots({ start = REPO_ROOT, mainCheckout = null } = {}) {
  const roots = ancestors(start)
  if (mainCheckout) {
    for (const dir of ancestors(mainCheckout)) {
      if (!roots.includes(dir)) roots.push(dir)
    }
  }
  return roots
}

/** `git rev-parse --git-common-dir` → the MAIN working tree, or null. The
 *  common dir is `<main>/.git` from the main checkout and from every worktree
 *  alike, so its parent is the tree that owns the dependencies. */
export function mainWorkingTree(cwd = REPO_ROOT) {
  try {
    const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    })
    if (r.status !== 0 || typeof r.stdout !== 'string') return null
    const common = r.stdout.trim()
    if (common === '' || !/[/\\]\.git$/.test(common)) return null
    return dirname(resolve(common))
  } catch {
    return null
  }
}

/** The PATH entries, split for the platform. */
export const pathEntries = (env = process.env) =>
  String(env.PATH ?? env.Path ?? '')
    .split(delimiter)
    .map((p) => p.trim())
    .filter((p) => p !== '')

/**
 * Find a locally installed binary.
 *
 * @returns {{ path: string, from: 'node_modules'|'PATH', tried: string[] } | null}
 *          `tried` lists every directory looked at, in order — it is what
 *          `describeMissing` reports and what a test asserts against.
 */
export function findLocalBin(
  name,
  { start = REPO_ROOT, mainCheckout, exists = existsSync, env = process.env, platform = process.platform } = {},
) {
  const names = binaryNames(name, platform)
  const tried = []
  const donor = mainCheckout === undefined ? mainWorkingTree(start) : mainCheckout
  for (const root of searchRoots({ start, mainCheckout: donor })) {
    const dir = join(root, 'node_modules', '.bin')
    tried.push(dir)
    for (const candidate of names) {
      const full = join(dir, candidate)
      if (exists(full)) return { path: full, from: 'node_modules', tried }
    }
  }
  for (const dir of pathEntries(env)) {
    tried.push(dir)
    for (const candidate of names) {
      const full = join(dir, candidate)
      if (exists(full)) return { path: full, from: 'PATH', tried }
    }
  }
  return null
}

/** Why nothing was found, naming the tool and everywhere it was looked for —
 *  the message a reader can act on, in place of a bare ENOENT. */
export function describeMissing(name, tried = []) {
  return [
    `${name} could not be found — neither in a node_modules/.bin above this checkout,`,
    'in the main working tree behind it, nor on PATH.',
    'In a git worktree the usual cause is missing dependencies:  node scripts/worktree-bootstrap.mjs',
    `Looked in (${tried.length}):`,
    ...tried.map((d) => `  ${d}`),
  ].join('\n')
}

/** The same resolution, but a hard failure rather than a null — for callers that
 *  have no sensible way to continue. */
export function requireLocalBin(name, options) {
  const found = findLocalBin(name, options)
  if (found === null) throw new Error(describeMissing(name, []))
  return found.path
}

/**
 * DID THE PROCESS ACTUALLY RUN? — the distinction a non-zero exit cannot make.
 *
 * A spawn that never started (ENOENT, EACCES, a killed child) reports failure
 * exactly like a tool that ran and refused its input. Every assertion of the
 * form "it rejected, because the exit code was non-zero" is therefore satisfied
 * by a tool that is not installed, which is a false GREEN: the rule the check
 * guards could rot away and the suite would stay green in exactly the
 * environment most of our work happens in.
 *
 * A process that RAN said something. `error` (a spawn-level failure) is decisive
 * on its own; otherwise real output is the evidence, and a caller that knows the
 * tool's shape passes `expect` to demand it looks like that tool's output rather
 * than like a shell complaining the command was not found.
 *
 * @param {{ error?: Error|null, status?: number|null, stdout?: string, stderr?: string, out?: string }} result
 * @param {{ expect?: RegExp }} [options]
 */
export function didRun(result, { expect: shape } = {}) {
  if (!result || result.error) return false
  // A child killed by a signal never reported on its own input.
  if (result.signal) return false
  const out = `${result.out ?? ''}${result.stdout ?? ''}${result.stderr ?? ''}`
  if (out.trim() === '') return result.status === 0
  if (shape && !shape.test(out)) return false
  return true
}

/** The message for a spawn that never ran, so every caller words it the same and
 *  a reader never mistakes it for the tool's verdict. */
export const NOT_RUN = (name, result = {}) =>
  [
    `THE ${name.toUpperCase()} DID NOT RUN — this is not a rejection.`,
    'A spawn that never started exits non-zero exactly like a tool that ran and refused,',
    'so treating this exit code as a verdict would be a false green.',
    `  exit:   ${result.status ?? '(none)'}`,
    `  error:  ${result.error?.message ?? '(none)'}`,
    `  output: ${JSON.stringify(`${result.out ?? ''}${result.stdout ?? ''}${result.stderr ?? ''}`.slice(0, 400))}`,
  ].join('\n')
