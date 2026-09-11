// WHAT THE VERIFICATION LADDER READS (point 1086). The decision is pure and
// lives in scripts/verify/ladder-core.mjs; this is the half that touches the
// tree — git, file times, the render-verify run ledger and the suites' own
// sources — so the core stays pinnable without a repository.
//
// EVERY FAILURE HERE IS OPEN. A ladder that cannot read the tree must never be
// the reason a regression did not run, so each probe answers with an empty list
// rather than a throw, and `ladderCheck` returns an `unreadable` verdict that
// lets the run start.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from '../repo-paths.mjs'
import { parseDiffSuiteMap } from '../point-brief-core.mjs'
import { readRenderState } from '../render-verify-state.mjs'
import { listNonPredictive } from './sections.mjs'
import { LADDER_STATUS, classifyLadderRun, ladderVerdict, porcelainPaths } from './ladder-core.mjs'

const ROOT = REPO_ROOT

/** Git's stdout, UNTRIMMED: `git status --porcelain` puts its two status
 *  columns in fixed positions and the first is usually a space, so trimming the
 *  whole output eats the first path's first character. Callers that want a
 *  single token trim it themselves. */
function git(args, cwd = ROOT) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
}

/** The commit both this branch and `main` share, or null on a checkout that has
 *  no `main` to compare against (a CI clone of a tag, a detached probe). */
function mergeBase(cwd) {
  for (const ref of ['main', 'origin/main']) {
    try {
      return git(['merge-base', ref, 'HEAD'], cwd).trim()
    } catch {
      /* try the next spelling */
    }
  }
  return null
}

/**
 * The files this branch has EDITED, with the newest moment each was touched.
 *
 * Two sources, because either alone misses half the repair loop: the commits
 * this branch carries beyond `main`, and the working tree's uncommitted changes.
 * The time is the file's own mtime — that is what "carries edits" means, and it
 * moves for a `git merge` exactly as it moves for an editor. A file that is gone
 * (a deletion) drops out: no suite can be pre-checked for it.
 *
 * On `main` itself the branch half is empty, so only uncommitted work counts —
 * which is the honest answer there and keeps a fresh CI clone free.
 */
export function editedFiles({ cwd = ROOT } = {}) {
  const paths = new Set()
  const base = mergeBase(cwd)
  if (base) {
    try {
      for (const line of git(['diff', '--name-only', base, 'HEAD'], cwd).split('\n')) {
        if (line.trim()) paths.add(line.trim())
      }
    } catch {
      /* unreadable history — the working tree below still speaks */
    }
  }
  try {
    for (const path of porcelainPaths(git(['status', '--porcelain'], cwd))) paths.add(path)
  } catch {
    /* not a repository — nothing is edited as far as the ladder can tell */
  }
  const out = []
  for (const path of paths) {
    try {
      out.push({ path, editedAt: statSync(join(cwd, path)).mtimeMs })
    } catch {
      /* deleted, or outside the checkout */
    }
  }
  return out
}

/** The merge commits this branch carries beyond `main`. A merge brings in other
 *  material the suite covers, so it ages the rung exactly as an edit does. */
export function branchMerges({ cwd = ROOT } = {}) {
  const base = mergeBase(cwd)
  if (!base) return []
  try {
    return git(['log', '--merges', '--format=%ct', `${base}..HEAD`], cwd)
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => ({ at: Number(line.trim()) * 1000 }))
  } catch {
    return []
  }
}

/** The work order's own diff→suite mapping paragraph. */
export function diffSuiteMap({ cwd = ROOT } = {}) {
  try {
    return parseDiffSuiteMap(readFileSync(join(cwd, 'TASKS.md'), 'utf8'))
  } catch {
    return []
  }
}

/** The non-predictive declarations of the suites that actually have a section
 *  run in the ledger — reading every suite's source would cost megabytes for an
 *  answer only those suites can change. */
export function nonPredictiveDeclarations(runs, { cwd = ROOT } = {}) {
  const out = {}
  const suites = new Set((runs ?? []).filter((r) => r?.partial === true).map((r) => r.suite))
  for (const suite of suites) {
    const path = join(cwd, 'scripts', 'verify', `${suite}.mjs`)
    if (!existsSync(path)) continue
    try {
      const found = listNonPredictive(readFileSync(path, 'utf8'))
      if (found.length > 0) out[suite] = found
    } catch {
      /* unreadable suite source — it declares nothing, as before this existed */
    }
  }
  return out
}

/**
 * THE LADDER'S ANSWER FOR ONE LAUNCH, ready for run-logged.mjs to act on.
 * `escape` is `{ why }` from `--no-ladder "<why>"`. Never throws.
 */
export function ladderCheck({ argv = [], verifyGl, escape = null, cwd = ROOT, now = Date.now() } = {}) {
  let run
  try {
    run = classifyLadderRun({ argv, verifyGl })
  } catch (error) {
    return {
      ok: true,
      status: LADDER_STATUS.UNREADABLE,
      reason: `the ladder could not read this command line (${error?.message ?? error}) — the run starts`,
      commands: [],
      suites: [],
      threshold: null,
      record: { status: LADDER_STATUS.UNREADABLE, at: now },
    }
  }
  try {
    const runs = readRenderState()?.runs ?? []
    return ladderVerdict({
      run,
      changes: editedFiles({ cwd }),
      merges: branchMerges({ cwd }),
      runs,
      map: diffSuiteMap({ cwd }),
      nonPredictive: nonPredictiveDeclarations(runs, { cwd }),
      escape,
      now,
    })
  } catch (error) {
    return {
      ok: true,
      status: LADDER_STATUS.UNREADABLE,
      reason: `the ladder could not read the tree (${error?.message ?? error}) — the run starts, unladdered`,
      commands: [],
      suites: [],
      threshold: null,
      record: { status: LADDER_STATUS.UNREADABLE, at: now },
    }
  }
}
