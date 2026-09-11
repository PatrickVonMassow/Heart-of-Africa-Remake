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
import { porcelainPaths } from '../batch-in-flight-core.mjs'
import { parseDiffSuiteMap } from '../point-brief-core.mjs'
import { readRenderState } from '../render-verify-state.mjs'
import { listNonPredictive, sectionsForLines } from './sections.mjs'
import { LADDER_STATUS, classifyLadderRun, ladderVerdict } from './ladder-core.mjs'

const ROOT = REPO_ROOT

/** Git's stdout, UNTRIMMED: `git status --porcelain -z` puts its two status
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
 * The time is the LATER of the file's own mtime and the newest branch commit
 * that touched it — which is what this function always promised and, until the
 * four-eyes round of 11.09.2026, did not do: it read mtimes alone.
 *
 * AND A FILE THAT IS GONE STILL COUNTS. The earlier reasoning — "a deletion
 * drops out: no suite can be pre-checked for it" — had it backwards. Deleting a
 * file the suite covers can break that suite exactly as editing it can, and
 * dropping the path made the whole run answer FREE: delete one tracked file
 * under a covered directory, change nothing else, and the ladder waved the full
 * pass through. A deleted path therefore keeps its commit time, and an
 * UNCOMMITTED deletion keeps the path with time 0 — present in the material, so
 * the run is not free, without the moving `now` that would refuse every run
 * forever.
 *
 * On `main` itself the branch half is empty, so only uncommitted work counts —
 * which is the honest answer there and keeps a fresh CI clone free.
 */
export function editedFiles({ cwd = ROOT } = {}) {
  /** path → the newest time any SOURCE claims for it. */
  const times = new Map()
  const note = (path, at) => {
    const key = String(path ?? '').trim()
    if (!key) return
    const n = Number(at) || 0
    times.set(key, Math.max(times.get(key) ?? 0, n))
  }

  const base = mergeBase(cwd)
  if (base) {
    // ONE pass over the branch's own commits. `\x01` cannot occur in a path, so
    // a stamp line is never confused with a file called "1789084300".
    try {
      let at = 0
      for (const line of git(['log', '--format=%x01%ct', '--name-only', `${base}..HEAD`], cwd).split('\n')) {
        if (line.startsWith('\x01')) at = Number(line.slice(1).trim()) * 1000
        else note(line, at)
      }
    } catch {
      /* unreadable history — the working tree below still speaks */
    }
  }
  try {
    // NO PRACTICAL LIMIT HERE. The shared reader bounds its work at 400 paths
    // because a liveness probe must not turn into a tree walk; for the ladder an
    // unread path is a MISSING edit, which reads as "nothing is edited" — the
    // silent pass this mechanism exists to prevent. A verification run can
    // afford the whole listing.
    for (const path of porcelainPaths(git(['status', '--porcelain', '-z'], cwd), { limit: 100_000 })) {
      note(path, 0)
    }
  } catch {
    /* not a repository — nothing is edited as far as the ladder can tell */
  }

  const out = []
  for (const [path, committedAt] of times) {
    let mtime = 0
    try {
      mtime = statSync(join(cwd, path)).mtimeMs
    } catch {
      /* gone, or outside the checkout — its commit time still speaks for it */
    }
    const sections = sectionsTouched(path, cwd, base)
    out.push({ path, editedAt: Math.max(mtime, committedAt), ...(sections ? { sections } : {}) })
  }
  return out
}

/** A suite's own source file, and the suite it IS. */
const SUITE_SOURCE = /^scripts\/verify\/([a-z0-9-]+)\.mjs$/
/** The `+` side of a `-U0` hunk header: where the change landed. */
const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/**
 * The lines a path changed, on the branch and in the working tree. `-U0` so a
 * hunk names the changed lines and not three neighbours on each side.
 * Total: never throws — an unreadable diff names no lines.
 */
function changedLines(path, cwd, base) {
  const lines = new Set()
  const scan = (text) => {
    for (const line of String(text).split('\n')) {
      const m = HUNK.exec(line)
      if (!m) continue
      const start = Number(m[1])
      // A pure DELETION hunk counts 0 and points at the line that now sits
      // where the removed ones were: that line is what a reader sees change.
      const count = Math.max(m[2] === undefined ? 1 : Number(m[2]), 1)
      for (let i = 0; i < count; i += 1) lines.add(start + i)
    }
  }
  if (base) {
    try {
      scan(git(['diff', '-U0', base, 'HEAD', '--', path], cwd))
    } catch {
      /* unreadable history */
    }
  }
  try {
    scan(git(['diff', '-U0', 'HEAD', '--', path], cwd))
  } catch {
    /* not a repository, or the path is untracked */
  }
  return [...lines]
}

/**
 * THE SECTIONS AN EDIT TO A SUITE'S OWN SOURCE TOUCHES (point 1086).
 *
 * Attached ONLY when every changed line lands inside a declared section. A line
 * in the boot prologue, an unreadable source, or a suite that declares no
 * sections all answer `undefined` — and the ladder then behaves as it did
 * before, crediting any narrow green of the suite. Conservative on purpose: this
 * may only ever REFUSE a rung that provably did not run the edited block, never
 * invent a refusal out of a link it could not read.
 */
function sectionsTouched(path, cwd, base) {
  const suite = SUITE_SOURCE.exec(path)?.[1]
  if (!suite) return undefined
  let source = ''
  try {
    source = readFileSync(join(cwd, path), 'utf8')
  } catch {
    return undefined
  }
  const lines = changedLines(path, cwd, base)
  if (lines.length === 0) return undefined
  const names = sectionsForLines(source, lines)
  if (names.length === 0 || names.includes(null)) return undefined
  return names
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
